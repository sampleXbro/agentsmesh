/**
 * Copilot-specific entry mappers for the descriptor-driven import runner.
 * Sibling-file pattern avoids the `index.ts ↔ importer.ts` TDZ trap.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import { pruneUndefined } from '../import/shared-import-helpers.js';
import { basename, join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedCommandWithFallback,
  serializeImportedRuleWithFallback,
} from '../import/import-metadata.js';
import { toGlobsArray } from '../import/shared-import-helpers.js';
import type { ImportEntryMapper } from '../catalog/import-descriptor.js';
import { parseCommandPromptFrontmatter } from './command-prompt.js';

/** Legacy `.github/copilot/*.instructions.md` rules: `globs` field, strip `.instructions` suffix. */
export const copilotLegacyRuleMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destFileName = relativePath.replace(/\.instructions\.md$/i, '.md');
  const destPath = join(destDir, destFileName);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  const globs = toGlobsArray(frontmatter.globs);
  const canonicalFm = pruneUndefined({
    root: false,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: globs.length > 0 ? globs : undefined,
  });
  return {
    destPath,
    toPath: `${AB_RULES}/${destFileName}`,
    content: await serializeImportedRuleWithFallback(destPath, canonicalFm, body),
  };
};

/**
 * New `.github/instructions/*.{instructions.md,md}` rules: prefer the `applyTo`
 * key (Copilot CLI uses it), fall back to `globs`.
 */
export const copilotNewRuleMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destFileName = relativePath.endsWith('.instructions.md')
    ? relativePath.replace(/\.instructions\.md$/i, '.md')
    : relativePath;
  const destPath = join(destDir, destFileName);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  const globs = toGlobsArray(
    frontmatter.applyTo !== undefined ? frontmatter.applyTo : frontmatter.globs,
  );
  const canonicalFm = pruneUndefined({
    root: false,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: globs.length > 0 ? globs : undefined,
  });
  return {
    destPath,
    toPath: `${AB_RULES}/${destFileName}`,
    content: await serializeImportedRuleWithFallback(destPath, canonicalFm, body),
  };
};

/** Copilot prompt commands: parsed via `parseCommandPromptFrontmatter`, may rename to use `command.name`. */
export const copilotCommandMapper: ImportEntryMapper = async ({
  absolutePath,
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const previewRelativePath = relativePath.replace(/\.prompt\.md$/i, '.md');
  const previewDest = join(destDir, previewRelativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(previewDest));
  const command = parseCommandPromptFrontmatter(frontmatter, absolutePath);
  const relDir = previewRelativePath.includes('/')
    ? previewRelativePath.slice(0, previewRelativePath.lastIndexOf('/'))
    : '';
  const fileName = `${command.name}.md`;
  const relativeCommandPath = relDir ? `${relDir}/${fileName}` : fileName;
  const destPath = join(destDir, relativeCommandPath);
  return {
    destPath,
    toPath: `${AB_COMMANDS}/${relativeCommandPath}`,
    content: await serializeImportedCommandWithFallback(
      destPath,
      {
        description: command.description,
        hasDescription: Object.prototype.hasOwnProperty.call(frontmatter, 'description'),
        allowedTools: command.allowedTools,
        hasAllowedTools:
          Object.prototype.hasOwnProperty.call(frontmatter, 'tools') ||
          Object.prototype.hasOwnProperty.call(frontmatter, 'x-agentsmesh-allowed-tools'),
      },
      body,
    ),
  };
};

/** Copilot agents: `.agent.md` extension stripped; fall back to filename for `name`. */
export const copilotAgentMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  if (!relativePath.endsWith('.agent.md')) return null;
  const relativeMdPath = relativePath.replace(/\.agent\.md$/i, '.md');
  const base = basename(relativeMdPath, '.md');
  const destPath = join(destDir, relativeMdPath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_AGENTS}/${relativeMdPath}`,
    content: await serializeImportedAgentWithFallback(
      destPath,
      { ...frontmatter, name: typeof frontmatter.name === 'string' ? frontmatter.name : base },
      body,
    ),
  };
};
