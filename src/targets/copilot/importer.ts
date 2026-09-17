/**
 * Copilot target importer.
 *
 * Declarative parts (root rule, legacy + new rule directories, prompt commands,
 * `.agent.md` agents) live in `descriptor.importer` and are dispatched by the
 * shared runner — including scope variance (project vs `~/.copilot/`).
 *
 * Imperative parts (skills tree traversal via `findDirectorySkills`, the
 * Copilot hooks JSON parser, and the legacy hook script directory) stay here.
 * Hooks are project-only, expressed by simply not declaring a `hooks` source
 * in the descriptor — no `if (scope === 'global')` branch needed.
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import {
  COPILOT_GLOBAL_SKILLS_DIR,
  COPILOT_SKILLS_DIR,
  COPILOT_GLOBAL_HOOKS_DIR,
} from './constants.js';
import { importHooks } from './hook-parser.js';
import { importSkills } from './skills-adapter.js';
import { importCopilotGlobalMcp } from './global-mcp.js';
import { descriptor } from './index.js';

export async function importFromCopilot(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);
  await importSkills(
    projectRoot,
    results,
    normalize,
    scope === 'global' ? COPILOT_GLOBAL_SKILLS_DIR : COPILOT_SKILLS_DIR,
  );
  if (scope === 'project') {
    await importHooks(projectRoot, results);
  } else {
    await importHooks(projectRoot, results, {
      hooksDirRel: COPILOT_GLOBAL_HOOKS_DIR,
      legacyDirRel: null,
    });
    await importCopilotGlobalMcp(projectRoot, results);
  }
  return results;
}
