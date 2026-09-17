/**
 * Codebuff import reference map: native path -> canonical path.
 *
 * Nested `<dir>/AGENTS.md` files are mapped from the rules the importer
 * actually produced, so a link to `src/AGENTS.md` rewrites to
 * `.agentsmesh/rules/src.md` — the same `<dir>` -> `<dir-with-dashes>` slug the
 * importer uses.
 */

import { AB_IGNORE, AB_MCP } from '../../canonical-paths.js';
import {
  addScopedAgentsMappings,
  addSkillLikeMapping,
  listFiles,
  rel,
} from '../import-map-shared.js';
import {
  CODEBUFF_ROOT_FILE,
  CODEBUFF_SKILLS_DIR,
  CODEBUFF_MCP_FILE,
  CODEBUFF_IGNORE_FILE,
  CODEBUFF_GLOBAL_ROOT_FILE,
  CODEBUFF_GLOBAL_SKILLS_DIR,
  CODEBUFF_GLOBAL_MCP_FILE,
} from '../../../targets/codebuff/constants.js';
import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';
import { AB_RULES } from './constants.js';

/**
 * The shared scoped-`AGENTS.md` walk does not skip `node_modules`, but
 * `importCodebuffRules` does, so a vendored knowledge file would map onto a
 * canonical rule that import never writes.
 */
function dropVendoredMappings(refs: Map<string, string>): void {
  for (const key of refs.keys()) {
    if (key.split('/').includes('node_modules')) refs.delete(key);
  }
}

export async function buildCodebuffImportPaths(
  refs: Map<string, string>,
  projectRoot: string,
  scope: TargetLayoutScope = 'project',
): Promise<void> {
  if (scope === 'global') {
    refs.set(CODEBUFF_GLOBAL_ROOT_FILE, `${AB_RULES}/_root.md`);
    for (const absPath of await listFiles(projectRoot, CODEBUFF_GLOBAL_SKILLS_DIR)) {
      addSkillLikeMapping(refs, rel(projectRoot, absPath), CODEBUFF_GLOBAL_SKILLS_DIR);
    }
    refs.set(CODEBUFF_GLOBAL_MCP_FILE, AB_MCP);
    return;
  }

  refs.set(CODEBUFF_ROOT_FILE, `${AB_RULES}/_root.md`);
  // Same nested `<dir>/AGENTS.md` -> `<dir-with-dashes>.md` slug the importer uses.
  await addScopedAgentsMappings(refs, projectRoot);
  dropVendoredMappings(refs);
  for (const absPath of await listFiles(projectRoot, CODEBUFF_SKILLS_DIR)) {
    addSkillLikeMapping(refs, rel(projectRoot, absPath), CODEBUFF_SKILLS_DIR);
  }
  refs.set(CODEBUFF_MCP_FILE, AB_MCP);
  // Project only: `PROJECT_IGNORE_FILES` are resolved per project directory.
  refs.set(CODEBUFF_IGNORE_FILE, AB_IGNORE);
}
