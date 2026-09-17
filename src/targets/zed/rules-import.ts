/**
 * Import Zed's single instruction file back into canonical rules.
 *
 * `additionalRules` is `embedded`: Zed has no rules directory, so `generateRules`
 * folds every non-root rule into a managed block inside `.rules`
 * (`~/.config/zed/AGENTS.md` globally). The import half has to split that block
 * back out. Copying the whole body into `_root.md` — what the descriptor
 * `singleFile` runner does — loses each rule's identity, and the next generate
 * strips the managed block before rebuilding it, so the text is gone for good.
 *
 * Same shape as antigravity/junie/cursor: the splitter is not declarable through
 * the descriptor import runner yet.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { splitEmbeddedRulesToCanonical } from '../import/embedded-rules.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { ZED_TARGET, ZED_ROOT_FILE, ZED_GLOBAL_ROOT_FILE } from './constants.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

const CANONICAL_ROOT_RULE = `${AB_RULES}/_root.md`;

export async function importZedRules(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
  normalize: Normalize,
): Promise<void> {
  const rel = scope === 'global' ? ZED_GLOBAL_ROOT_FILE : ZED_ROOT_FILE;
  const srcPath = join(projectRoot, rel);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const split = await splitEmbeddedRulesToCanonical({
    content,
    projectRoot,
    rulesDir: AB_RULES,
    sourcePath: srcPath,
    fromTool: ZED_TARGET,
    normalize,
  });
  results.push(...split.results);

  const destPath = join(projectRoot, CANONICAL_ROOT_RULE);
  const { frontmatter, body } = parseFrontmatter(normalize(split.rootContent, srcPath, destPath));
  const output = await serializeImportedRuleWithFallback(
    destPath,
    {
      ...frontmatter,
      root: true,
      description:
        typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
      globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : undefined,
    },
    body,
  );
  await mkdirp(join(projectRoot, AB_RULES));
  await writeFileAtomic(destPath, output);
  results.push({
    fromTool: ZED_TARGET,
    fromPath: srcPath,
    toPath: CANONICAL_ROOT_RULE,
    feature: 'rules',
  });
}
