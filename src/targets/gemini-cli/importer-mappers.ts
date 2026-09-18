import { AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import {
  serializeImportedCommandWithFallback,
  serializeImportedRuleWithFallback,
} from '../import/import-metadata.js';
import type { ImportFileMapping } from '../import/import-orchestrator.js';
import { toGlobsArray, toToolsArray } from '../import/shared-import-helpers.js';
import { parseFlexibleFrontmatter } from './format-helpers.js';

export async function mapGeminiRuleFile(
  relativePath: string,
  destDir: string,
  normalizeTo: (destinationFile: string) => string,
): Promise<ImportFileMapping> {
  const relativeMdPath = relativePath.replace(/\\/g, '/');
  const destPath = join(destDir, relativeMdPath);
  const { frontmatter, body } = parseFlexibleFrontmatter(normalizeTo(destPath));
  const globs = toGlobsArray(frontmatter.globs);
  const canonicalFm: Record<string, unknown> = {
    root: false,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: globs.length > 0 ? globs : undefined,
  };
  Object.keys(canonicalFm).forEach((key) => {
    if (canonicalFm[key] === undefined) delete canonicalFm[key];
  });
  return {
    destPath,
    toPath: `${AB_RULES}/${relativeMdPath}`,
    feature: 'rules',
    content: await serializeImportedRuleWithFallback(destPath, canonicalFm, body),
  };
}

export async function mapGeminiCommandFile(
  relativePath: string,
  destDir: string,
  normalizeTo: (destinationFile: string) => string,
): Promise<ImportFileMapping> {
  const relativeMdPath = relativePath.replace(/\.(toml|md)$/i, '.md').replace(/\\/g, '/');
  const destPath = join(destDir, relativeMdPath);
  const normalized = normalizeTo(destPath);
  const { frontmatter, body } = relativePath.endsWith('.toml')
    ? parseTomlCommand(normalized)
    : parseFlexibleFrontmatter(normalized);
  const fromCamel = toToolsArray(frontmatter.allowedTools);
  const fromKebab = toToolsArray(frontmatter['allowed-tools']);
  const allowedTools = fromCamel.length > 0 ? fromCamel : fromKebab;
  return {
    destPath,
    toPath: `${AB_COMMANDS}/${relativeMdPath}`,
    feature: 'commands',
    content: await serializeImportedCommandWithFallback(
      destPath,
      {
        description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
        hasDescription: Object.prototype.hasOwnProperty.call(frontmatter, 'description'),
        allowedTools,
        hasAllowedTools:
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowedTools') ||
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools'),
      },
      body,
    ),
  };
}

function parseTomlCommand(normalized: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  try {
    const parsed = parseToml(normalized) as Record<string, unknown>;
    return {
      frontmatter: parsed,
      body: typeof parsed.prompt === 'string' ? parsed.prompt : '',
    };
  } catch {
    return { frontmatter: {}, body: normalized.trim() };
  }
}
