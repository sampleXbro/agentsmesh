/**
 * Import `.codex/rules/*.md` and agentsmesh-embedded `.codex/rules/*.rules` into canonical rules.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import { basename, join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { CODEX_TARGET, CODEX_RULES_DIR, CODEX_PERMISSIONS_RULES_BASENAME } from './constants.js';
import { tryParseEmbeddedCanonicalFromCodexRules } from './codex-rules-embed.js';

export async function importCodexNonRootRuleFiles(
  projectRoot: string,
  destDir: string,
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const codexRulesPath = join(projectRoot, CODEX_RULES_DIR);
  try {
    const ruleFiles = await readDirRecursiveNoSymlinks(codexRulesPath);
    const mdFiles = ruleFiles.filter((f) => f.endsWith('.md'));
    for (const srcPath of mdFiles) {
      const content = await readFileSafe(srcPath);
      if (!content) continue;
      const relativePath = relative(codexRulesPath, srcPath).replace(/\\/g, '/');
      const destPath = join(destDir, relativePath);
      const { frontmatter, body } = parseFrontmatter(normalize(content, srcPath, destPath));
      await mkdirp(destDir);
      const outFm = frontmatter.root === true ? frontmatter : { ...frontmatter, root: false };
      const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
      await writeFileAtomic(destPath, outContent);
      results.push({
        fromTool: CODEX_TARGET,
        fromPath: srcPath,
        toPath: `${AB_RULES}/${relativePath}`,
        feature: 'rules',
      });
    }
    const starlarkFiles = ruleFiles.filter(
      (f) => f.endsWith('.rules') && basename(f) !== CODEX_PERMISSIONS_RULES_BASENAME,
    );
    for (const srcPath of starlarkFiles) {
      const raw = await readFileSafe(srcPath);
      if (!raw) continue;
      const relativePath = relative(codexRulesPath, srcPath)
        .replace(/\\/g, '/')
        .replace(/\.rules$/i, '.md');
      const destPath = join(destDir, relativePath);
      await mkdirp(destDir);
      const embedded = tryParseEmbeddedCanonicalFromCodexRules(raw);
      if (embedded) {
        const outContent = await serializeImportedRuleWithFallback(
          destPath,
          {
            description: embedded.meta.description,
            globs: embedded.meta.globs,
            root: false,
          },
          normalize(embedded.body, srcPath, destPath),
        );
        await writeFileAtomic(destPath, outContent);
      } else {
        const outContent = await serializeImportedRuleWithFallback(
          destPath,
          {
            root: false,
            description: '',
            globs: [],
            codex_emit: 'execution',
          },
          normalize(raw.trim(), srcPath, destPath),
        );
        await writeFileAtomic(destPath, outContent);
      }
      results.push({
        fromTool: CODEX_TARGET,
        fromPath: srcPath,
        toPath: `${AB_RULES}/${relativePath}`,
        feature: 'rules',
      });
    }
  } catch {
    /* CODEX_RULES_DIR may not exist */
  }
  return results;
}
