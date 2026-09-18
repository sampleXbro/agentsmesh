/**
 * Descriptor-driven importer runner.
 *
 * Walks `descriptor.importer` for each feature in canonical order, resolves
 * scope-specific source paths, and dispatches to the existing helpers
 * (`importFileDirectory`, MCP / ignore writers). Scope variance lives entirely
 * in the spec — features with no source for the current scope are skipped
 * silently, eliminating per-importer `if (scope === 'global')` branches.
 *
 * Targets with bespoke parsing (codex-cli rule splitter, windsurf workflows,
 * gemini-cli policies) keep `generators.importFrom`. They may still call this
 * runner for the declarable parts of their flow.
 */

import { basename, dirname, join, posix } from 'node:path';
import type { ImportResult, McpServer } from '../../core/types.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { writeMcpWithMerge } from './mcp-merge.js';
import { tryParseFrontmatter } from '../../utils/text/markdown.js';
import { toStringArray, toStringRecord } from './shared-import-helpers.js';
import { serializeImportedRuleWithFallback } from './import-metadata.js';
import { importFileDirectory } from './import-orchestrator.js';
import { resolveMapper } from './descriptor-default-mappers.js';
import { isPreservedBoilerplate } from '../../install/importers/boilerplate-filter.js';
import {
  IMPORT_FEATURE_ORDER,
  resolveScopedSources,
  type ContentNormalizer,
  type ImportFeatureKind,
  type ImportFeatureSpec,
} from '../catalog/import-descriptor.js';
import type { TargetDescriptor, TargetLayoutScope } from '../catalog/target-descriptor.js';

async function runSingleFile(
  spec: ImportFeatureSpec,
  sources: readonly string[],
  projectRoot: string,
  fromTool: string,
  normalize: ContentNormalizer,
): Promise<ImportResult[]> {
  if (!spec.canonicalRootFilename) {
    throw new Error(`singleFile spec for ${spec.feature} must set canonicalRootFilename`);
  }
  const destDir = join(projectRoot, spec.canonicalDir);
  for (const rel of sources) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    await mkdirp(destDir);
    const destPath = join(destDir, spec.canonicalRootFilename);
    const normalizeTo = (destinationFile: string): string =>
      normalize(content, srcPath, destinationFile);

    if (spec.map) {
      let mapping;
      try {
        mapping = await spec.map({
          absolutePath: srcPath,
          relativePath: rel,
          content,
          destDir,
          normalizeTo,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`⚠ skipping ${srcPath}: ${msg}\n`);
        continue;
      }
      if (!mapping) continue;
      await writeFileAtomic(mapping.destPath, mapping.content);
      return [{ fromTool, fromPath: srcPath, toPath: mapping.toPath, feature: spec.feature }];
    }

    const result = tryParseFrontmatter(normalizeTo(destPath), srcPath);
    if (!result.ok) {
      process.stderr.write(`⚠ skipping ${srcPath}: ${result.error.message}\n`);
      continue;
    }
    const { frontmatter, body } = result.value;
    const remapped = spec.frontmatterRemap ? spec.frontmatterRemap(frontmatter) : frontmatter;
    const outFm = spec.markAsRoot ? { ...remapped, root: true } : remapped;
    const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
    await writeFileAtomic(destPath, outContent);
    return [
      {
        fromTool,
        fromPath: srcPath,
        toPath: `${spec.canonicalDir}/${spec.canonicalRootFilename}`,
        feature: spec.feature,
      },
    ];
  }
  return [];
}

async function runDirectory(
  spec: ImportFeatureSpec,
  sources: readonly string[],
  projectRoot: string,
  fromTool: string,
  normalize: ContentNormalizer,
): Promise<ImportResult[]> {
  const mapper = resolveMapper(spec);
  const destDir = join(projectRoot, spec.canonicalDir);
  const results: ImportResult[] = [];
  for (const rel of sources) {
    const srcDir = join(projectRoot, rel);
    const part = await importFileDirectory({
      srcDir,
      destDir,
      extensions: [...(spec.extensions ?? ['.md'])],
      fromTool,
      normalize,
      mapEntry: async ({ srcPath, relativePath, content, normalizeTo }) => {
        // Preserved boilerplate (README/LICENSE/NOTICE/COPYING/COPYRIGHT) at
        // any depth in a third-party source tree is folder documentation or
        // legal attribution, never a canonical entity. Filtering here prevents
        // basename-slug collisions like two `README.md` files in `agents/` and
        // `agents/external/` taking down the whole install. Noise stems
        // (`security`, `contributing`, ...) stay through because users may
        // legitimately name a rule `.claude/rules/security.md`.
        if (isPreservedBoilerplate(basename(srcPath))) return null;
        let mapping;
        try {
          mapping = await mapper({
            absolutePath: srcPath,
            relativePath,
            content,
            destDir,
            normalizeTo: (destinationFile) => normalizeTo(destinationFile),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`⚠ skipping ${srcPath}: ${msg}\n`);
          return null;
        }
        if (!mapping) return null;
        return {
          destPath: mapping.destPath,
          toPath: mapping.toPath,
          feature: spec.feature,
          content: mapping.content,
        };
      },
    });
    results.push(...part);
  }
  return results;
}

function resolveCanonicalFilePath(spec: ImportFeatureSpec): string {
  const filename = spec.canonicalFilename!;
  if (filename.includes('/') || filename.includes('\\')) return filename;
  return posix.join(spec.canonicalDir, filename);
}

async function runFlatFile(
  spec: ImportFeatureSpec,
  sources: readonly string[],
  projectRoot: string,
  fromTool: string,
): Promise<ImportResult[]> {
  if (!spec.canonicalFilename) {
    throw new Error(`flatFile spec for ${spec.feature} must set canonicalFilename`);
  }
  const canonicalPath = resolveCanonicalFilePath(spec);
  for (const rel of sources) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    const destPath = join(projectRoot, canonicalPath);
    await mkdirp(dirname(destPath));
    await writeFileAtomic(destPath, content.trimEnd());
    return [{ fromTool, fromPath: srcPath, toPath: canonicalPath, feature: spec.feature }];
  }
  return [];
}

function parseMcpJson(content: string, serversKey = 'mcpServers'): Record<string, McpServer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const raw = (parsed as Record<string, unknown>)[serversKey];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, McpServer> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const server = value as Record<string, unknown>;
    const description = typeof server.description === 'string' ? server.description : undefined;
    if (typeof server.command === 'string') {
      out[name] = {
        type: typeof server.type === 'string' ? server.type : 'stdio',
        command: server.command,
        args: toStringArray(server.args),
        env: toStringRecord(server.env),
        description,
      };
      continue;
    }
    if (typeof server.url === 'string') {
      out[name] = {
        type: typeof server.type === 'string' ? server.type : 'http',
        url: server.url,
        headers: toStringRecord(server.headers),
        env: toStringRecord(server.env),
        description,
      };
    }
  }
  return out;
}

async function runMcpJson(
  spec: ImportFeatureSpec,
  sources: readonly string[],
  projectRoot: string,
  fromTool: string,
): Promise<ImportResult[]> {
  if (!spec.canonicalFilename) {
    throw new Error(`mcpJson spec for ${spec.feature} must set canonicalFilename`);
  }
  const canonicalPath = resolveCanonicalFilePath(spec);
  for (const rel of sources) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    const imported = parseMcpJson(content, spec.mcpServersKey);
    if (Object.keys(imported).length === 0) return [];
    await writeMcpWithMerge(projectRoot, canonicalPath, imported);
    return [{ fromTool, fromPath: srcPath, toPath: canonicalPath, feature: spec.feature }];
  }
  return [];
}

function dispatchSpec(
  spec: ImportFeatureSpec,
  sources: readonly string[],
  projectRoot: string,
  fromTool: string,
  normalize: ContentNormalizer,
): Promise<ImportResult[]> {
  switch (spec.mode) {
    case 'singleFile':
      return runSingleFile(spec, sources, projectRoot, fromTool, normalize);
    case 'directory':
      return runDirectory(spec, sources, projectRoot, fromTool, normalize);
    case 'flatFile':
      return runFlatFile(spec, sources, projectRoot, fromTool);
    case 'mcpJson':
      return runMcpJson(spec, sources, projectRoot, fromTool);
  }
}

async function runSpec(
  spec: ImportFeatureSpec,
  scope: TargetLayoutScope,
  projectRoot: string,
  fromTool: string,
  normalize: ContentNormalizer,
): Promise<ImportResult[]> {
  const primary = resolveScopedSources(spec.source, scope);
  const fallback = resolveScopedSources(spec.fallbacks, scope);
  if (primary.length === 0 && fallback.length === 0) return [];
  if (primary.length > 0) {
    const results = await dispatchSpec(spec, primary, projectRoot, fromTool, normalize);
    if (results.length > 0) return results;
  }
  if (fallback.length > 0) {
    return dispatchSpec(spec, fallback, projectRoot, fromTool, normalize);
  }
  return [];
}

function specsForFeature(
  importer: NonNullable<TargetDescriptor['importer']>,
  feature: ImportFeatureKind,
): readonly ImportFeatureSpec[] {
  const value = importer[feature];
  if (!value) return [];
  if (Array.isArray(value)) return value as readonly ImportFeatureSpec[];
  return [value as ImportFeatureSpec];
}

export async function runDescriptorImport(
  descriptor: TargetDescriptor,
  projectRoot: string,
  scope: TargetLayoutScope,
  options?: { readonly normalize?: ContentNormalizer },
): Promise<ImportResult[]> {
  const importer = descriptor.importer;
  if (!importer) return [];
  const normalize =
    options?.normalize ??
    (await createImportReferenceNormalizer(descriptor.id, projectRoot, scope));
  const results: ImportResult[] = [];
  for (const feature of IMPORT_FEATURE_ORDER) {
    for (const spec of specsForFeature(importer, feature)) {
      results.push(...(await runSpec(spec, scope, projectRoot, descriptor.id, normalize)));
    }
  }
  return results;
}

/**
 * The shared opening of every target's `importFrom`: resolve the scope, build
 * the reference normalizer for the target, and run the descriptor-declared
 * import. Returns the accumulator each target then appends its non-declarative
 * extras (skills, MCP, hooks) to.
 */
export async function beginImport(
  descriptor: TargetDescriptor,
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<{
  scope: TargetLayoutScope;
  results: ImportResult[];
  normalize: Awaited<ReturnType<typeof createImportReferenceNormalizer>>;
}> {
  const scope = options.scope ?? 'project';
  const normalize = await createImportReferenceNormalizer(descriptor.id, projectRoot, scope);
  const results = await runDescriptorImport(descriptor, projectRoot, scope, { normalize });
  return { scope, results: [...results], normalize };
}
