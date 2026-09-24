/**
 * Windsurf reads a nested `<dir>/AGENTS.md` as a rule for that directory.
 * Embedded rule blocks in it (written by Codex CLI or Codebuff) go back to
 * their own canonical files; only the text outside them is the directory rule.
 * A nested file whose text is a `.windsurf/rules/*.md` rule's body is the copy
 * older versions also wrote, so it is skipped instead of becoming a new rule.
 */

import { basename, dirname, join, relative } from 'node:path';
import { AB_RULES } from '../../core/canonical-paths.js';
import type { ImportResult } from '../../core/types.js';
import { splitNestedAgentsFile } from '../import/embedded-rules.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import {
  removePathIfExists,
  shouldImportScopedAgentsRule,
} from '../import/scoped-agents-import.js';
import { readDirRecursiveNoSymlinks, readFileSafe } from '../../utils/filesystem/fs.js';
import { splitFrontmatter } from '../../utils/text/markdown.js';
import { WINDSURF_RULES_DIR } from './constants.js';

type Normalizer = (content: string, sourceFile: string, destinationFile: string) => string;

const bodyKey = (text: string): string => text.replace(/\r\n?/g, '\n').trim();

async function windsurfRuleBodies(projectRoot: string): Promise<Set<string>> {
  const files = await readDirRecursiveNoSymlinks(join(projectRoot, WINDSURF_RULES_DIR));
  const bodies = new Set<string>();
  for (const file of files.filter((path) => path.endsWith('.md'))) {
    const content = await readFileSafe(file);
    if (content !== null) bodies.add(bodyKey(splitFrontmatter(content)?.body ?? content));
  }
  return bodies;
}

export async function importWindsurfNestedAgents(
  projectRoot: string,
  normalize: Normalizer,
): Promise<ImportResult[]> {
  const destRulesDir = join(projectRoot, AB_RULES);
  const embedded: ImportResult[] = [];
  const ruleBodies = await windsurfRuleBodies(projectRoot);
  const results = await importFileDirectory({
    srcDir: projectRoot,
    destDir: destRulesDir,
    extensions: ['AGENTS.md'],
    fromTool: 'windsurf',
    normalize,
    mapEntry: async ({ srcPath, content, normalizeTo }) => {
      const relDir = relative(projectRoot, dirname(srcPath)).replace(/\\/g, '/');
      if (!relDir || relDir === '.' || basename(srcPath) !== 'AGENTS.md') return null;
      const ruleName = relDir.replace(/\//g, '-');
      if (!shouldImportScopedAgentsRule(relDir)) {
        await removePathIfExists(join(destRulesDir, `${ruleName}.md`));
        return null;
      }
      const ownText = await splitNestedAgentsFile(
        {
          content,
          projectRoot,
          rulesDir: AB_RULES,
          sourcePath: srcPath,
          fromTool: 'windsurf',
          normalize,
        },
        embedded,
      );
      if (ownText === null || ruleBodies.has(bodyKey(ownText))) return null;
      const destPath = join(destRulesDir, `${ruleName}.md`);
      return {
        destPath,
        toPath: `${AB_RULES}/${ruleName}.md`,
        feature: 'rules',
        content: await serializeImportedRuleWithFallback(
          destPath,
          { root: false, globs: [`${relDir}/**`] },
          normalizeTo(destPath, ownText),
        ),
      };
    },
  });
  return [...results, ...embedded];
}
