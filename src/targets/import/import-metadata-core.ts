import { toToolsArray as toStringArray } from './shared-import-helpers.js';
import { basename } from 'node:path';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { parseFrontmatter, serializeFrontmatter } from '../../utils/text/markdown.js';
import { stripAgentsmeshRootInstructionParagraph } from '../projection/root-instruction-paragraph.js';

export interface ImportedCommandMetadata {
  description?: string;
  hasDescription: boolean;
  allowedTools?: string[];
  hasAllowedTools: boolean;
}

export { toStringArray };

export async function readExistingFrontmatter(path: string): Promise<Record<string, unknown>> {
  const existing = await readFileSafe(path);
  if (!existing) return {};
  return parseFrontmatter(existing).frontmatter;
}

export function readString(frontmatter: Record<string, unknown>, key: string): string | undefined {
  return typeof frontmatter[key] === 'string' ? frontmatter[key] : undefined;
}

export function readHooks(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const hooks = frontmatter.hooks;
  return hooks && typeof hooks === 'object' && !Array.isArray(hooks)
    ? (hooks as Record<string, unknown>)
    : undefined;
}

function pruneUndefined(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(frontmatter).filter(([, value]) => value !== undefined));
}

function serializeCanonicalRuleFrontmatter(
  destinationPath: string,
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const isRootRule = basename(destinationPath, '.md') === '_root';
  const rest = { ...frontmatter };
  delete (rest as Record<string, unknown>).root;
  return {
    root: isRootRule,
    ...rest,
  };
}

export async function serializeImportedRuleWithFallback(
  destinationPath: string,
  importedFrontmatter: Record<string, unknown>,
  body: string,
): Promise<string> {
  const existingFrontmatter = await readExistingFrontmatter(destinationPath);
  const normalizedBody =
    basename(destinationPath, '.md') === '_root'
      ? stripAgentsmeshRootInstructionParagraph(body)
      : body.trim();
  const mergedFrontmatter = serializeCanonicalRuleFrontmatter(
    destinationPath,
    pruneUndefined({ ...existingFrontmatter, ...importedFrontmatter }),
  );
  const canonicalFrontmatter: Record<string, unknown> = {
    root: mergedFrontmatter.root === true,
    description:
      typeof mergedFrontmatter.description === 'string' ? mergedFrontmatter.description : '',
  };
  if (canonicalFrontmatter.root === false) {
    canonicalFrontmatter.globs = toStringArray(mergedFrontmatter.globs);
  }
  for (const [key, value] of Object.entries(mergedFrontmatter)) {
    if (key === 'root' || key === 'description' || key === 'globs' || value === undefined) continue;
    canonicalFrontmatter[key] = value;
  }
  return serializeFrontmatter(canonicalFrontmatter, normalizedBody || '');
}
