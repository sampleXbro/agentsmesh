import { basename } from 'node:path';
import type { CanonicalFiles } from '../types.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { addAncestorMappings, addDirectoryMapping } from './import-map-shared.js';
import { ruleTargetPath, commandTargetPath, agentTargetPath } from './map-targets.js';
import { AGENTS_MD } from '../../targets/codex-cli/constants.js';
import { GEMINI_ROOT } from '../../targets/gemini-cli/constants.js';
import { WINDSURF_AGENTS_MD, WINDSURF_RULES_ROOT } from '../../targets/windsurf/constants.js';
import { getTargetSkillDir } from '../../targets/catalog/builtin-targets.js';

export function isMarkdownLikeOutput(path: string): boolean {
  return (
    path.endsWith('.md') ||
    path.endsWith('.mdc') ||
    path === '.claude/CLAUDE.md' ||
    path === AGENTS_MD ||
    path === GEMINI_ROOT ||
    path === WINDSURF_AGENTS_MD ||
    path === WINDSURF_RULES_ROOT
  );
}

export function buildReferenceMap(
  target: string,
  canonical: CanonicalFiles,
  config: ValidatedConfig,
  scope: TargetLayoutScope = 'project',
): Map<string, string> {
  const refs = new Map<string, string>();

  for (const rule of canonical.rules) {
    const path = ruleTargetPath(target, rule, scope);
    if (path) refs.set(`.agentsmesh/rules/${basename(rule.source)}`, path);
  }

  for (const command of canonical.commands) {
    const path = commandTargetPath(target, command.name, config, scope);
    if (path) refs.set(`.agentsmesh/commands/${command.name}.md`, path);
  }

  // Build a temporary map of agent canonical paths → target paths, then filter
  // out mappings where multiple canonical agents share the same combined output
  // file (e.g. cline's `.cline/agents.yaml`). Rewriting individual agent refs
  // to a combined file loses per-agent distinction and cannot be round-tripped;
  // keeping the canonical path in prose is safer and preserves semantics.
  const agentTargetPaths = new Map<string, string>();
  const sharedTargetPaths = new Set<string>();
  for (const agent of canonical.agents) {
    const path = agentTargetPath(target, agent.name, config, scope);
    if (!path) continue;
    if (agentTargetPaths.has(path)) {
      sharedTargetPaths.add(path);
    } else {
      agentTargetPaths.set(path, `.agentsmesh/agents/${agent.name}.md`);
    }
  }
  for (const [path, canonicalPath] of agentTargetPaths.entries()) {
    if (!sharedTargetPaths.has(path)) {
      refs.set(canonicalPath, path);
    }
  }

  const skillDir = getTargetSkillDir(target, scope);
  if (!skillDir) return refs;

  for (const skill of canonical.skills) {
    addDirectoryMapping(refs, `.agentsmesh/skills/${skill.name}`, `${skillDir}/${skill.name}`);
    refs.set(`.agentsmesh/skills/${skill.name}/SKILL.md`, `${skillDir}/${skill.name}/SKILL.md`);
    for (const file of skill.supportingFiles) {
      const relativePath = file.relativePath.replace(/\\/g, '/');
      const canonicalPath = `.agentsmesh/skills/${skill.name}/${relativePath}`;
      const targetPath = `${skillDir}/${skill.name}/${relativePath}`;
      refs.set(canonicalPath, targetPath);
      addAncestorMappings(refs, canonicalPath, targetPath, '.agentsmesh/skills');
    }
  }

  return refs;
}
