import { AB_ROOT_RULE, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { splitEmbeddedRulesToCanonical } from '../import/embedded-rules.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import {
  JUNIE_TARGET,
  JUNIE_AGENTS_FALLBACK,
  JUNIE_DOT_AGENTS,
  JUNIE_CI_GUIDELINES,
  JUNIE_GUIDELINES,
  JUNIE_SKILLS_DIR,
} from './constants.js';
import { descriptor } from './index.js';

/**
 * Junie's root rule supports four candidate paths and may carry embedded
 * non-root rules that need splitting; this stays imperative because the
 * descriptor singleFile mode does not (yet) cover splitter post-processing.
 */
async function importRootRule(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const sources = [JUNIE_DOT_AGENTS, JUNIE_GUIDELINES, JUNIE_CI_GUIDELINES, JUNIE_AGENTS_FALLBACK];
  const destPath = join(projectRoot, AB_ROOT_RULE);

  for (const relPath of sources) {
    const srcPath = join(projectRoot, relPath);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    const split = await splitEmbeddedRulesToCanonical({
      content,
      projectRoot,
      rulesDir: AB_RULES,
      sourcePath: srcPath,
      fromTool: JUNIE_TARGET,
      normalize,
    });
    results.push(...split.results);
    const { frontmatter, body } = parseFrontmatter(normalize(split.rootContent, srcPath, destPath));
    const output = await serializeImportedRuleWithFallback(
      destPath,
      {
        root: true,
        description:
          typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
        globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : undefined,
      },
      body,
    );
    await writeFileAtomic(destPath, output);
    results.push({
      fromTool: JUNIE_TARGET,
      fromPath: srcPath,
      toPath: AB_ROOT_RULE,
      feature: 'rules',
    });
    return;
  }
}

export async function importFromJunie(projectRoot: string): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(JUNIE_TARGET, projectRoot);
  await importRootRule(projectRoot, results, normalize);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, 'project', { normalize })));
  await importEmbeddedSkills(projectRoot, JUNIE_SKILLS_DIR, JUNIE_TARGET, results, normalize);
  return results;
}
