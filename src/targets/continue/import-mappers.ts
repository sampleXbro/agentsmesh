/**
 * Continue-specific entry mappers for the descriptor-driven import runner.
 * Lives in a sibling file so the descriptor in `index.ts` can reference these
 * mappers without forming a circular import chain through `importer.ts`.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedCommandWithFallback,
  serializeImportedRuleWithFallback,
} from '../import/import-metadata.js';
import type { ImportEntryMapper } from '../catalog/import-descriptor.js';
import { parseCommandRuleFrontmatter, serializeImportedCommand } from './command-rule.js';

function isContinueRootRulePath(relativePath: string): boolean {
  return relativePath === 'general.md' || relativePath === '_root.md';
}

/**
 * Continue rules: most files become non-root rules; `general.md` and the
 * legacy `_root.md` rename to `_root.md` and get marked as root.
 */
export const continueRuleMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const isRoot = isContinueRootRulePath(relativePath);
  const canonicalRelative = isRoot ? '_root.md' : relativePath;
  const destPath = join(destDir, canonicalRelative);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  const canonical: Record<string, unknown> = {
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : undefined,
    root: isRoot,
  };
  if (canonical.description === undefined) delete canonical.description;
  if (canonical.globs === undefined) delete canonical.globs;
  return {
    destPath,
    toPath: `${AB_RULES}/${canonicalRelative}`,
    content: await serializeImportedRuleWithFallback(destPath, canonical, body),
  };
};

/**
 * Continue commands carry `x-agentsmesh-*` metadata; the mapper extracts a
 * normalized command via `parseCommandRuleFrontmatter` and rebuilds canonical
 * frontmatter (`description`, `allowed-tools`).
 */
export const continueCommandMapper: ImportEntryMapper = async ({
  absolutePath,
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const stagingPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(stagingPath));
  const command = parseCommandRuleFrontmatter(frontmatter, absolutePath);
  const commandName = command.name || relativePath.replace(/\.md$/, '').replace(/^.*\//, '');
  const relativeDir = relativePath.includes('/')
    ? relativePath.slice(0, relativePath.lastIndexOf('/'))
    : '';
  const relativeCommandPath = relativeDir
    ? `${relativeDir}/${commandName}.md`
    : `${commandName}.md`;
  const commandPath = join(destDir, relativeCommandPath);
  const content = await serializeImportedCommandWithFallback(
    commandPath,
    {
      description: command.description,
      hasDescription: Boolean(command.description),
      allowedTools: command.allowedTools,
      hasAllowedTools: command.allowedTools.length > 0,
    },
    parseFrontmatter(serializeImportedCommand(command, body)).body,
  );
  return {
    destPath: commandPath,
    toPath: `${AB_COMMANDS}/${relativeCommandPath}`,
    content,
  };
};

/**
 * Continue agents: only `.continue/agents/*.md` (agent files) are imported.
 * YAML in that folder is a Continue assistant profile — a whole config with
 * models/context/docs at both scopes — so it is left to its owner rather than
 * flattened into a canonical agent that keeps just name/description/prompt.
 */
export const continueAgentMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_AGENTS}/${relativePath}`,
    content: await serializeImportedAgentWithFallback(destPath, frontmatter, body),
  };
};
