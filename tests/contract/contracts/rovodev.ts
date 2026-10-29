import type { TargetPathContract } from './types.js';

export const rovodevContract: TargetPathContract = {
  generated: [
    '.rovodev/commands/review.md',
    '.rovodev/prompts.yml',
    '.rovodev/subagents/code-reviewer.md',
    '.rovodev/subagents/researcher.md',
    '.rovodev/skills/api-generator/SKILL.md',
    '.rovodev/skills/api-generator/references/route-checklist.md',
    '.rovodev/skills/api-generator/template.ts',
    'AGENTS.md',
  ],
  imported: [
    '.agentsmesh/agents/code-reviewer.md',
    '.agentsmesh/agents/researcher.md',
    '.agentsmesh/commands/review.md',
    '.agentsmesh/rules/_root.md',
    '.agentsmesh/skills/api-generator/SKILL.md',
    '.agentsmesh/skills/api-generator/references/route-checklist.md',
    '.agentsmesh/skills/api-generator/template.ts',
  ],
};
