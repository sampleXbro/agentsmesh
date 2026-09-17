import { AB_HOOKS } from '../../canonical-paths.js';
import { addSimpleFileMapping, addSkillLikeMapping, listFiles, rel } from '../import-map-shared.js';
import { CLAUDE_HOOKS_JSON } from '../../../targets/claude-code/constants.js';
import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';
import { AB_AGENTS, AB_COMMANDS, AB_RULES } from './constants.js';

export async function buildClaudeCodeImportPaths(
  refs: Map<string, string>,
  projectRoot: string,
  scope: TargetLayoutScope = 'project',
): Promise<void> {
  refs.set('.claude/CLAUDE.md', `${AB_RULES}/_root.md`);
  refs.set(CLAUDE_HOOKS_JSON, AB_HOOKS);
  if (scope === 'project') {
    refs.set('CLAUDE.md', `${AB_RULES}/_root.md`);
  }
  if (scope === 'global') {
    for (const absPath of await listFiles(projectRoot, '.agents/skills')) {
      addSkillLikeMapping(refs, rel(projectRoot, absPath), '.agents/skills');
    }
  }
  for (const absPath of await listFiles(projectRoot, '.claude/rules')) {
    addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_RULES, '.md');
  }
  for (const absPath of await listFiles(projectRoot, '.claude/commands')) {
    addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_COMMANDS, '.md');
  }
  for (const absPath of await listFiles(projectRoot, '.claude/agents')) {
    addSimpleFileMapping(refs, rel(projectRoot, absPath), AB_AGENTS, '.md');
  }
  for (const absPath of await listFiles(projectRoot, '.claude/skills')) {
    addSkillLikeMapping(refs, rel(projectRoot, absPath), '.claude/skills');
  }
}
