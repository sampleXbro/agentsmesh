import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { splitEmbeddedRulesToCanonical } from '../import/embedded-rules.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';

export async function importCursorRootFile(input: {
  projectRoot: string;
  results: ImportResult[];
  sourcePath: string;
  content: string;
  normalize: (content: string, sourceFile: string, destinationFile: string) => string;
}): Promise<boolean> {
  const destDir = join(input.projectRoot, AB_RULES);
  await mkdirp(destDir);
  const destPath = join(destDir, '_root.md');
  const split = await splitEmbeddedRulesToCanonical({
    content: input.content,
    projectRoot: input.projectRoot,
    rulesDir: AB_RULES,
    sourcePath: input.sourcePath,
    fromTool: 'cursor',
    normalize: input.normalize,
  });
  input.results.push(...split.results);

  const normalizedRoot = input.normalize(split.rootContent, input.sourcePath, destPath);
  if (!normalizedRoot.trim() && split.results.length > 0) return true;

  const { frontmatter, body } = parseFrontmatter(normalizedRoot);
  const outFm = frontmatter.root === true ? frontmatter : { ...frontmatter, root: true };
  const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
  await writeFileAtomic(destPath, outContent);
  input.results.push({
    fromTool: 'cursor',
    fromPath: input.sourcePath,
    toPath: `${AB_RULES}/_root.md`,
    feature: 'rules',
  });
  return true;
}
