/**
 * Import Codebuff knowledge files into canonical rules.
 *
 * Two shapes, one per scope:
 *   - project: `AGENTS.md` at the root plus one nested `<dir>/AGENTS.md` per
 *     scoped directory, mapped back to `<dir-with-dashes>.md` carrying a
 *     `<dir>/**` glob. That glob is what makes the round trip stable — the
 *     generator derives the same directory from it again.
 *   - global: only `~/.AGENTS.md`, which carries scoped rules inside an
 *     embedded block.
 *
 * The root file is ALWAYS run through `splitEmbeddedRulesToCanonical`, even at
 * project scope where this target does not write embedded blocks. When another
 * AGENTS.md-first target (amp, warp, jules) is enabled alongside Codebuff, the
 * collision resolver keeps the richer file, so the block can be on disk anyway.
 * Copying it verbatim into `_root.md` would bake generated markers into
 * canonical content and duplicate every scoped rule on the next generate.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import { basename, dirname, join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { splitEmbeddedRulesToCanonical, splitNestedAgentsFile } from '../import/embedded-rules.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { shouldImportScopedAgentsRule } from '../import/scoped-agents-import.js';
import { CODEBUFF_TARGET, CODEBUFF_ROOT_FILE, CODEBUFF_GLOBAL_ROOT_FILE } from './constants.js';

type Normalizer = (content: string, sourceFile: string, destinationFile: string) => string;

async function importRootRule(
  projectRoot: string,
  scope: TargetLayoutScope,
  normalize: Normalizer,
): Promise<ImportResult[]> {
  const relPath = scope === 'global' ? CODEBUFF_GLOBAL_ROOT_FILE : CODEBUFF_ROOT_FILE;
  const sourcePath = join(projectRoot, relPath);
  const content = await readFileSafe(sourcePath);
  if (content === null) return [];

  const destDir = join(projectRoot, AB_RULES);
  await mkdirp(destDir);
  const destPath = join(destDir, '_root.md');

  const split = await splitEmbeddedRulesToCanonical({
    content,
    projectRoot,
    rulesDir: AB_RULES,
    sourcePath,
    fromTool: CODEBUFF_TARGET,
    normalize,
  });

  const { frontmatter, body } = parseFrontmatter(
    normalize(split.rootContent, sourcePath, destPath),
  );
  await writeFileAtomic(
    destPath,
    await serializeImportedRuleWithFallback(destPath, { ...frontmatter, root: true }, body),
  );

  return [
    ...split.results,
    {
      fromTool: CODEBUFF_TARGET,
      fromPath: sourcePath,
      toPath: `${AB_RULES}/_root.md`,
      feature: 'rules',
    },
  ];
}

/**
 * Dependencies ship their own `AGENTS.md`. The shared scoped-rule guard only
 * skips dot-directories, so a vendored knowledge file would become a canonical
 * rule with a `node_modules/**` glob and be written back into `node_modules/`
 * on every generate.
 */
function isVendored(relDir: string): boolean {
  return relDir.split('/').includes('node_modules');
}

/** Nested `<dir>/AGENTS.md`; the root file, dot-directories and vendored dirs are excluded. */
async function importNestedRules(
  projectRoot: string,
  normalize: Normalizer,
): Promise<ImportResult[]> {
  const destDir = join(projectRoot, AB_RULES);
  const embedded: ImportResult[] = [];
  const results = await importFileDirectory({
    srcDir: projectRoot,
    destDir,
    extensions: [CODEBUFF_ROOT_FILE],
    fromTool: CODEBUFF_TARGET,
    normalize,
    mapEntry: async ({ srcPath, content, normalizeTo }) => {
      if (basename(srcPath) !== CODEBUFF_ROOT_FILE) return null;
      const relDir = relative(projectRoot, dirname(srcPath)).replace(/\\/g, '/');
      if (!relDir || relDir === '.') return null;
      if (!shouldImportScopedAgentsRule(relDir)) return null;
      if (isVendored(relDir)) return null;
      const ownText = await splitNestedAgentsFile(
        {
          content,
          projectRoot,
          rulesDir: AB_RULES,
          sourcePath: srcPath,
          fromTool: CODEBUFF_TARGET,
          normalize,
        },
        embedded,
      );
      if (ownText === null) return null;

      const ruleName = relDir.replace(/\//g, '-');
      const destPath = join(destDir, `${ruleName}.md`);
      const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath, ownText));
      return {
        destPath,
        toPath: `${AB_RULES}/${ruleName}.md`,
        feature: 'rules',
        content: await serializeImportedRuleWithFallback(
          destPath,
          { ...frontmatter, root: false, globs: [`${relDir}/**`] },
          body,
        ),
      };
    },
  });
  return [...results, ...embedded];
}

export async function importCodebuffRules(
  projectRoot: string,
  scope: TargetLayoutScope,
  normalize: Normalizer,
): Promise<ImportResult[]> {
  const results = await importRootRule(projectRoot, scope, normalize);
  if (scope === 'global') return results;
  return [...results, ...(await importNestedRules(projectRoot, normalize))];
}
