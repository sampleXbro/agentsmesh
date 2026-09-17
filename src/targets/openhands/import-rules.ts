/**
 * Flat path-scoped rule files under `.agents/skills/`.
 *
 * The directory also holds skill bundles (`<name>/SKILL.md`) that
 * `importEmbeddedSkills` owns, so anything nested is skipped here. `_root.md` is
 * skipped too: it is the global root rule, imported by the `singleFile` spec.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import type { ImportEntryContext, ImportEntryMapping } from '../catalog/import-descriptor.js';
import { remapOpenhandsRuleFrontmatter } from './rules-format.js';

export async function mapOpenhandsFlatRule(
  ctx: ImportEntryContext,
): Promise<ImportEntryMapping | null> {
  if (ctx.relativePath.includes('/') || ctx.relativePath === '_root.md') return null;

  const destPath = join(ctx.destDir, ctx.relativePath);
  const { frontmatter, body } = parseFrontmatter(ctx.normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_RULES}/${ctx.relativePath}`,
    content: await serializeImportedRuleWithFallback(
      destPath,
      remapOpenhandsRuleFrontmatter(frontmatter),
      body,
    ),
  };
}
