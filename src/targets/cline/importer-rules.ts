import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { mapClineRuleFile } from './importer-mappers.js';
import { CLINE_RULES_DIR, CLINE_AGENTS_MD } from './constants.js';

async function writeRootRule(
  destRulesDir: string,
  sourcePath: string,
  content: string,
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  results: ImportResult[],
): Promise<void> {
  await mkdirp(destRulesDir);
  const destPath = join(destRulesDir, '_root.md');
  const { frontmatter, body } = parseFrontmatter(normalize(content, sourcePath, destPath));
  const hasRoot = frontmatter.root === true;
  const outFm = hasRoot ? frontmatter : { ...frontmatter, root: true };
  const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
  await writeFileAtomic(destPath, outContent);
  results.push({
    fromTool: 'cline',
    fromPath: sourcePath,
    toPath: `${AB_RULES}/_root.md`,
    feature: 'rules',
  });
}

export interface ImportClineRulesOptions {
  /** Rules directory to read from — project `.cline/rules` or global `.cline/data/settings/rules`. */
  rulesDir?: string;
  /**
   * Whether to fall back to `AGENTS.md` at `projectRoot` when no `_root.md`
   * is found. Only meaningful for project scope — in global mode
   * `projectRoot` is `$HOME`, which has no canonical `AGENTS.md` concept.
   */
  allowAgentsMdFallback?: boolean;
}

/**
 * Imports Cline rules from a rules directory (CLI docs: `.cline/rules/`, a
 * directory — no flat-file convention) into canonical rules.
 *
 * Root rule detection order: `<rulesDir>/_root.md`, then (project scope
 * only) `AGENTS.md` at the project root, then the first alphabetically-
 * sorted rule file.
 */
export async function importClineRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  options: ImportClineRulesOptions = {},
): Promise<void> {
  const rulesDir = options.rulesDir ?? CLINE_RULES_DIR;
  const allowAgentsMdFallback = options.allowAgentsMdFallback ?? true;
  const destRulesDir = join(projectRoot, AB_RULES);
  const clineRulesPath = join(projectRoot, rulesDir);

  let rootSourcePath: string | null = null;
  const rootPath = join(clineRulesPath, '_root.md');
  const rootContent = await readFileSafe(rootPath);
  if (rootContent !== null) {
    rootSourcePath = rootPath;
    await writeRootRule(destRulesDir, rootPath, rootContent, normalize, results);
  } else if (allowAgentsMdFallback) {
    const agentsMdPath = join(projectRoot, CLINE_AGENTS_MD);
    const agentsMdContent = await readFileSafe(agentsMdPath);
    if (agentsMdContent !== null) {
      rootSourcePath = agentsMdPath;
      await writeRootRule(destRulesDir, agentsMdPath, agentsMdContent, normalize, results);
    }
  }

  if (rootSourcePath === null) {
    const ruleFiles = await readDirRecursiveNoSymlinks(clineRulesPath);
    const mdFiles = ruleFiles.filter((f) => f.endsWith('.md')).sort();
    const first = mdFiles[0];
    if (first) {
      const firstContent = await readFileSafe(first);
      if (firstContent !== null) {
        rootSourcePath = first;
        await writeRootRule(destRulesDir, first, firstContent, normalize, results);
      }
    }
  }

  results.push(
    ...(await importFileDirectory({
      srcDir: clineRulesPath,
      destDir: destRulesDir,
      extensions: ['.md'],
      fromTool: 'cline',
      normalize,
      mapEntry: async ({ srcPath, relativePath, normalizeTo }) => {
        if (srcPath === rootSourcePath) return null;
        return mapClineRuleFile(relativePath, destRulesDir, normalizeTo);
      },
    })),
  );
}
