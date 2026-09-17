/**
 * Import Aider config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `CONVENTIONS.md`    — root rule
 *   - `.aider/skills/`    — skill bundles
 *   - `.aiderignore`      — ignore patterns
 *   - `.aider.conf.yml`   — the five hook command keys (see `hooks-import.ts`);
 *     the `read:` wiring is deterministic and is not imported as canonical
 *     content
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importAiderHooks } from './hooks-import.js';
import { AIDER_TARGET, AIDER_SKILLS_DIR, AIDER_GLOBAL_SKILLS_DIR } from './constants.js';
import { descriptor } from './index.js';

export async function importFromAider(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? AIDER_GLOBAL_SKILLS_DIR : AIDER_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, AIDER_TARGET, results, normalize);
  await importAiderHooks(projectRoot, results);

  return results;
}
