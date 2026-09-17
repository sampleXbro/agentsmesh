import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { mapCursorRuleFile } from './importer-mappers.js';
import { importCursorRootFile } from './import-root-helpers.js';
import { CURSOR_COMPAT_AGENTS, CURSOR_LEGACY_RULES, CURSOR_RULES_DIR } from './constants.js';

export async function importCursorRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const destDir = join(projectRoot, AB_RULES);
  let rootWritten = false;

  const rulesDir = join(projectRoot, CURSOR_RULES_DIR);
  results.push(
    ...(await importFileDirectory({
      srcDir: rulesDir,
      destDir,
      extensions: ['.mdc'],
      fromTool: 'cursor',
      normalize,
      mapEntry: async ({ srcPath, relativePath, normalizeTo }) => {
        if (rootWritten) {
          const raw = await readFileSafe(srcPath);
          if (raw !== null) {
            const { frontmatter } = parseFrontmatter(raw);
            if (frontmatter.alwaysApply === true) return null;
          }
        }
        return mapCursorRuleFile(relativePath, destDir, normalizeTo, () => {
          rootWritten = true;
        });
      },
    })),
  );

  if (!rootWritten) {
    const agentsPath = join(projectRoot, CURSOR_COMPAT_AGENTS);
    const agentsContent = await readFileSafe(agentsPath);
    if (agentsContent !== null) {
      rootWritten = await importCursorRootFile({
        projectRoot,
        results,
        sourcePath: agentsPath,
        content: agentsContent,
        normalize,
      });
    }
  }

  if (!rootWritten) {
    const cursorRulesPath = join(projectRoot, CURSOR_LEGACY_RULES);
    const cursorRulesContent = await readFileSafe(cursorRulesPath);
    if (cursorRulesContent !== null) {
      await importCursorRootFile({
        projectRoot,
        results,
        sourcePath: cursorRulesPath,
        content: cursorRulesContent,
        normalize,
      });
    }
  }
}
