/**
 * Import Kimi Code's instruction files back into canonical rules.
 *
 * Kimi Code CONCATENATES every instruction file it finds — `loadAgentsMdForRoots`
 * collects `~/.kimi-code/AGENTS.md`, then `~/.agents/AGENTS.md`, then for each
 * directory `.kimi-code/AGENTS.md` **and** the first of `AGENTS.md`/`agents.md`,
 * and `renderAgentFiles` joins them all. So every readable source is imported,
 * in that read order; taking only the first would drop a file the model sees.
 *
 * `additionalRules` is `embedded` because Kimi Code has no per-rule directory:
 * non-root rules ride in a managed block inside the instruction file. This
 * splits that block back out — the descriptor `singleFile` runner would copy the
 * whole body into `_root.md`, and the next generate strips the block before
 * rebuilding it, losing the rules for good.
 */

import { AB_ROOT_RULE, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { splitEmbeddedRulesToCanonical } from '../import/embedded-rules.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import {
  KIMI_CODE_TARGET,
  KIMI_CODE_ROOT_FILE,
  KIMI_CODE_NESTED_ROOT_FILE,
  KIMI_CODE_GLOBAL_ROOT_FILE,
  KIMI_CODE_SHARED_GLOBAL_ROOT_FILE,
} from './constants.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

interface Section {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

/** Every file Kimi Code reads for this scope, in its own concatenation order. */
const SOURCES: Record<TargetLayoutScope, readonly string[]> = {
  project: [KIMI_CODE_NESTED_ROOT_FILE, KIMI_CODE_ROOT_FILE],
  global: [KIMI_CODE_GLOBAL_ROOT_FILE, KIMI_CODE_SHARED_GLOBAL_ROOT_FILE],
};

export async function importKimiCodeRules(
  projectRoot: string,
  scope: TargetLayoutScope,
  results: ImportResult[],
  normalize: Normalize,
): Promise<void> {
  const destPath = join(projectRoot, AB_ROOT_RULE);
  const sections: Section[] = [];

  for (const rel of SOURCES[scope]) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    // Kimi Code's `isNonEmptyFile` skips a whitespace-only file outright.
    if (content === null || content.trim().length === 0) continue;

    const split = await splitEmbeddedRulesToCanonical({
      content,
      projectRoot,
      rulesDir: AB_RULES,
      sourcePath: srcPath,
      fromTool: KIMI_CODE_TARGET,
      normalize,
    });
    results.push(...split.results);
    sections.push(parseFrontmatter(normalize(split.rootContent, srcPath, destPath)));
    results.push({
      fromTool: KIMI_CODE_TARGET,
      fromPath: srcPath,
      toPath: AB_ROOT_RULE,
      feature: 'rules',
    });
  }

  if (sections.length === 0) return;

  const frontmatter = Object.assign({}, ...sections.map((section) => section.frontmatter));
  const body = sections
    .map((section) => section.body.trim())
    .filter((text) => text.length > 0)
    .join('\n\n');

  await mkdirp(join(projectRoot, AB_RULES));
  await writeFileAtomic(
    destPath,
    await serializeImportedRuleWithFallback(destPath, { ...frontmatter, root: true }, body),
  );
}
