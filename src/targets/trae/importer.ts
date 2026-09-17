import { AB_HOOKS, AB_RULES } from '../../core/canonical-paths.js';
import { basename, dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { importTraeGlobalPermissions } from './global-permissions.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  TRAE_TARGET,
  TRAE_PROJECT_RULES,
  TRAE_RULES_DIR,
  TRAE_SKILLS_DIR,
  TRAE_GLOBAL_RULES_DIR,
  TRAE_GLOBAL_ROOT_RULE,
  TRAE_GLOBAL_SKILLS_DIR,
  TRAE_HOOKS_FILE,
  TRAE_GLOBAL_HOOKS_FILE,
} from './constants.js';
import { descriptor } from './index.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

const CANONICAL_ROOT_RULE = `${AB_RULES}/_root.md`;

/** Import the root instruction file (project_rules.md or global user_rules/rules.md). */
async function importRoot(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const candidates =
    scope === 'global'
      ? [TRAE_GLOBAL_ROOT_RULE, TRAE_PROJECT_RULES]
      : [TRAE_PROJECT_RULES, TRAE_GLOBAL_ROOT_RULE];

  for (const rel of candidates) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    const destPath = join(projectRoot, CANONICAL_ROOT_RULE);
    const { frontmatter, body } = parseFrontmatter(normalize(content, srcPath, destPath));
    await mkdirp(join(projectRoot, AB_RULES));
    await writeFileAtomic(
      destPath,
      await serializeImportedRuleWithFallback(destPath, { ...frontmatter, root: true }, body),
    );
    results.push({
      fromTool: TRAE_TARGET,
      fromPath: srcPath,
      toPath: CANONICAL_ROOT_RULE,
      feature: 'rules',
    });
    return;
  }
}

/** Import non-root rules from .trae/rules/*.md (skipping project_rules.md). */
async function importNonRootRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const srcDir = join(projectRoot, scope === 'global' ? TRAE_GLOBAL_RULES_DIR : TRAE_RULES_DIR);
  const destDir = join(projectRoot, AB_RULES);

  results.push(
    ...(await importFileDirectory({
      srcDir,
      destDir,
      extensions: ['.md'],
      fromTool: TRAE_TARGET,
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        const filename = basename(relativePath);
        // Skip the root rules file
        if (filename === 'project_rules.md' || filename === 'rules.md') return null;
        const destPath = join(destDir, relativePath);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        return {
          destPath,
          toPath: `${AB_RULES}/${relativePath}`,
          feature: 'rules',
          content: await serializeImportedRuleWithFallback(
            destPath,
            { ...frontmatter, root: false },
            body,
          ),
        };
      },
    })),
  );
}

/**
 * Import Trae hooks.json (project: .trae/hooks.json, global: ~/.trae-cn/hooks.json)
 * into canonical hooks.yaml.
 *
 * Trae flat format: { "version": 1, "hooks": { "<Event>": [{ "matcher", "type", "command", "timeout"? }] } }
 */
async function importHooks(
  projectRoot: string,
  results: ImportResult[],
  scope: TargetLayoutScope,
): Promise<void> {
  const hooksFileRel = scope === 'global' ? TRAE_GLOBAL_HOOKS_FILE : TRAE_HOOKS_FILE;
  const srcPath = join(projectRoot, hooksFileRel);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

  const rawHooks = (parsed as Record<string, unknown>).hooks;
  if (!rawHooks || typeof rawHooks !== 'object' || Array.isArray(rawHooks)) return;

  const hooks: Record<
    string,
    Array<{ matcher: string; type: string; command: string; timeout?: number }>
  > = {};
  for (const [event, entries] of Object.entries(rawHooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      if (entry.type !== 'command' || typeof entry.command !== 'string') continue;
      const matcher = typeof entry.matcher === 'string' ? entry.matcher : '*';
      const imported: { matcher: string; type: string; command: string; timeout?: number } = {
        matcher,
        type: 'command',
        command: entry.command,
      };
      if (typeof entry.timeout === 'number') imported.timeout = entry.timeout;
      (hooks[event] ??= []).push(imported);
    }
  }

  if (Object.keys(hooks).length === 0) return;

  const destPath = join(projectRoot, AB_HOOKS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, stringifyYaml(hooks));
  results.push({
    fromTool: TRAE_TARGET,
    fromPath: srcPath,
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}

export async function importFromTrae(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(TRAE_TARGET, projectRoot, scope);

  await importRoot(projectRoot, results, normalize, scope);
  await importNonRootRules(projectRoot, results, normalize, scope);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, scope, { normalize })));
  await importEmbeddedSkills(
    projectRoot,
    scope === 'global' ? TRAE_GLOBAL_SKILLS_DIR : TRAE_SKILLS_DIR,
    TRAE_TARGET,
    results,
    normalize,
  );
  await importHooks(projectRoot, results, scope);
  if (scope === 'global') await importTraeGlobalPermissions(projectRoot, results);

  return results;
}
