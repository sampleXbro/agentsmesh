/**
 * Windsurf reads a nested `<dir>/AGENTS.md` as a rule for that directory.
 * Embedded rule blocks in it (written by Codex CLI or Codebuff) go back to
 * their own canonical files; only the text outside them is the directory rule.
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

type Normalizer = (content: string, sourceFile: string, destinationFile: string) => string;

export async function importWindsurfNestedAgents(
  projectRoot: string,
  normalize: Normalizer,
): Promise<ImportResult[]> {
  const destRulesDir = join(projectRoot, AB_RULES);
  const embedded: ImportResult[] = [];
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
      if (ownText === null) return null;
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
