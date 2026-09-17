/**
 * Built-in entry mappers for the descriptor-driven importer runner.
 * Each preset covers the canonical 80% case for its feature; targets with
 * non-standard frontmatter shapes pass a custom `map` instead.
 */

import { pruneUndefined } from './shared-import-helpers.js';
import { join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedCommandWithFallback,
  serializeImportedRuleWithFallback,
} from './import-metadata.js';
import { toStringArray } from './shared-import-helpers.js';
import type {
  FrontmatterRemap,
  ImportEntryContext,
  ImportEntryMapper,
  ImportEntryMapping,
  ImportFeatureSpec,
} from '../catalog/import-descriptor.js';

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function applyRemap(
  fm: Record<string, unknown>,
  remap: FrontmatterRemap | undefined,
): Record<string, unknown> {
  return remap ? remap(fm) : fm;
}

export function ruleMapper(spec: ImportFeatureSpec): ImportEntryMapper {
  return async (ctx: ImportEntryContext): Promise<ImportEntryMapping> => {
    const destPath = join(ctx.destDir, ctx.relativePath);
    const { frontmatter, body } = parseFrontmatter(ctx.normalizeTo(destPath));
    const remapped = applyRemap(frontmatter, spec.frontmatterRemap);
    const canonicalFm = pruneUndefined({
      root: false,
      description: pickString(remapped.description),
      globs: Array.isArray(remapped.globs) ? remapped.globs : undefined,
      ...remapped,
    });
    return {
      destPath,
      toPath: `${spec.canonicalDir}/${ctx.relativePath}`,
      content: await serializeImportedRuleWithFallback(destPath, canonicalFm, body),
    };
  };
}

export function commandMapper(spec: ImportFeatureSpec): ImportEntryMapper {
  return async (ctx: ImportEntryContext): Promise<ImportEntryMapping> => {
    const destPath = join(ctx.destDir, ctx.relativePath);
    const { frontmatter, body } = parseFrontmatter(ctx.normalizeTo(destPath));
    const remapped = applyRemap(frontmatter, spec.frontmatterRemap);
    const content = await serializeImportedCommandWithFallback(
      destPath,
      {
        hasDescription: true,
        description: pickString(remapped.description),
        hasAllowedTools: true,
        allowedTools: toStringArray(remapped['allowed-tools']),
      },
      body,
    );
    return {
      destPath,
      toPath: `${spec.canonicalDir}/${ctx.relativePath}`,
      content,
    };
  };
}

export function agentMapper(spec: ImportFeatureSpec): ImportEntryMapper {
  return async (ctx: ImportEntryContext): Promise<ImportEntryMapping> => {
    const destPath = join(ctx.destDir, ctx.relativePath);
    const { frontmatter, body } = parseFrontmatter(ctx.normalizeTo(destPath));
    const remapped = applyRemap(frontmatter, spec.frontmatterRemap);
    return {
      destPath,
      toPath: `${spec.canonicalDir}/${ctx.relativePath}`,
      content: await serializeImportedAgentWithFallback(destPath, remapped, body),
    };
  };
}

export function resolveMapper(spec: ImportFeatureSpec): ImportEntryMapper {
  if (spec.map) return spec.map;
  switch (spec.preset) {
    case 'rule':
      return ruleMapper(spec);
    case 'command':
      return commandMapper(spec);
    case 'agent':
      return agentMapper(spec);
    default:
      throw new Error(
        `ImportFeatureSpec for ${spec.feature} (mode: ${spec.mode}) needs a \`preset\` or \`map\``,
      );
  }
}
