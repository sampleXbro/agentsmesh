/**
 * Cursor-specific entry mappers for the descriptor-driven import runner.
 * Sibling-file pattern avoids the `index.ts ↔ importer.ts` TDZ trap.
 */

import { AB_AGENTS, AB_COMMANDS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedCommandWithFallback,
} from '../import/import-metadata.js';
import { toToolsArray } from '../import/shared-import-helpers.js';
import type { ImportEntryMapper } from '../catalog/import-descriptor.js';

/** Cursor commands accept either `allowedTools` (camel) or `allowed-tools` (kebab). */
export const cursorCommandMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  const fromCamel = toToolsArray(frontmatter.allowedTools);
  const allowedTools =
    fromCamel.length > 0 ? fromCamel : toToolsArray(frontmatter['allowed-tools']);
  return {
    destPath,
    toPath: `${AB_COMMANDS}/${relativePath}`,
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
};

/** Cursor agents are passthrough — every frontmatter key is preserved. */
export const cursorAgentMapper: ImportEntryMapper = async ({
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
