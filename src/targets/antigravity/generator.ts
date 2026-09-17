import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { appendEmbeddedRulesBlock } from '../projection/managed-blocks.js';
import { buildClaudeHooksObjectFromCanonical } from '../claude-code/hooks-format.js';
import { serializeAntigravityAgent } from './agents-format.js';
import {
  ANTIGRAVITY_AGENTS_DIR,
  ANTIGRAVITY_GLOBAL_ROOT,
  ANTIGRAVITY_HOOKS_FILE,
  ANTIGRAVITY_IGNORE_FILE,
  ANTIGRAVITY_RULES_ROOT,
  ANTIGRAVITY_RULES_DIR,
  ANTIGRAVITY_WORKFLOWS_DIR,
  ANTIGRAVITY_SKILLS_DIR,
} from './constants.js';

export type AntigravityOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): AntigravityOutput[] {
  const root = canonical.rules.find((r) => r.root);
  if (!root) return [];

  const outputs: AntigravityOutput[] = [
    { path: ANTIGRAVITY_RULES_ROOT, content: root.body.trim() || '' },
  ];

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('antigravity')) continue;
    const slug = basename(rule.source, '.md');
    outputs.push({
      path: `${ANTIGRAVITY_RULES_DIR}/${slug}.md`,
      content: rule.body.trim() || '',
    });
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): AntigravityOutput[] {
  return canonical.commands.map((cmd) => {
    const intro = cmd.description.trim();
    const body = cmd.body.trim();
    const content =
      intro && body && !body.startsWith(intro) ? `${intro}\n\n${body}` : body || intro;
    return {
      path: `${ANTIGRAVITY_WORKFLOWS_DIR}/${cmd.name}.md`,
      content,
    };
  });
}

export function generateSkills(canonical: CanonicalFiles): AntigravityOutput[] {
  return generateEmbeddedSkills(canonical, ANTIGRAVITY_SKILLS_DIR);
}

export function generateAgents(canonical: CanonicalFiles): AntigravityOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${ANTIGRAVITY_AGENTS_DIR}/${agent.name}.md`,
    content: serializeAntigravityAgent(agent),
  }));
}

/** Project-only; the global layout suppresses this path (no home-dir ignore file). */
export function generateIgnore(canonical: CanonicalFiles): AntigravityOutput[] {
  if (canonical.ignore.length === 0) return [];
  return [{ path: ANTIGRAVITY_IGNORE_FILE, content: canonical.ignore.join('\n') }];
}

export function renderAntigravityGlobalInstructions(canonical: CanonicalFiles): string {
  const root = canonical.rules.find((rule) => rule.root);
  const nonRootRules = canonical.rules.filter((rule) => {
    if (rule.root) return false;
    return rule.targets.length === 0 || rule.targets.includes('antigravity');
  });

  return appendEmbeddedRulesBlock(root?.body.trim() ?? '', nonRootRules);
}

export function generateHooks(canonical: CanonicalFiles): AntigravityOutput[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  const hooks = buildClaudeHooksObjectFromCanonical(canonical);
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: ANTIGRAVITY_HOOKS_FILE, content: JSON.stringify(hooks, null, 2) }];
}

export const generatePermissions = NO_OUTPUTS;

export { ANTIGRAVITY_GLOBAL_ROOT };
