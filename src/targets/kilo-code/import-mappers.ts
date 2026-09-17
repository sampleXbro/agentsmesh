/**
 * Kilo Code-specific entry mappers for the descriptor-driven import runner.
 *
 * Lives in a sibling file (not `importer.ts`) to avoid the
 * `index.ts ↔ importer.ts` TDZ trap: object literals capture references
 * eagerly at module init, so descriptor-referenced mappers must come from a
 * file that does NOT import `index.ts`.
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

/**
 * Non-root rule mapper for both `.kilo/rules/` (new) and `.kilocode/rules/`
 * (legacy auto-loaded directory). Skips empty filenames; passes `description`
 * and `globs` frontmatter through if present.
 */
export const kiloNonRootRuleMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_RULES}/${relativePath}`,
    content: await serializeImportedRuleWithFallback(
      destPath,
      {
        root: false,
        description:
          typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
        globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : undefined,
      },
      body,
    ),
  };
};

/**
 * Command mapper for `.kilo/commands/` (new) and `.kilocode/workflows/`
 * (legacy). Kilo commands carry `description` only; no allowed-tools field.
 */
export const kiloCommandMapper: ImportEntryMapper = async ({
  relativePath,
  normalizeTo,
  destDir,
}) => {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_COMMANDS}/${relativePath}`,
    content: await serializeImportedCommandWithFallback(
      destPath,
      {
        hasDescription: Object.prototype.hasOwnProperty.call(frontmatter, 'description'),
        description:
          typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
        hasAllowedTools: false,
        allowedTools: [],
      },
      body,
    ),
  };
};

/**
 * Native first-class agent mapper for `.kilo/agents/<name>.md`. Passes every
 * frontmatter key through so round-trips preserve `description`, `mode`,
 * `model`, and any future kilo-specific fields.
 */
export const kiloAgentMapper: ImportEntryMapper = async ({
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
