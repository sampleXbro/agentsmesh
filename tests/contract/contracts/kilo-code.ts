import type { TargetPathContract } from './types.js';

export const kiloCodeContract: TargetPathContract = {
  generated: [
    '.kilo/agents/code-reviewer.md',
    '.kilo/agents/researcher.md',
    '.kilo/commands/review.md',
    '.kilo/rules/typescript.md',
    '.kilo/skills/api-generator/SKILL.md',
    '.kilo/skills/api-generator/references/route-checklist.md',
    '.kilo/skills/api-generator/template.ts',
    '.kilocodeignore',
    'AGENTS.md',
    'kilo.jsonc',
  ],
  imported: [
    '.agentsmesh/agents/code-reviewer.md',
    '.agentsmesh/agents/researcher.md',
    '.agentsmesh/commands/review.md',
    '.agentsmesh/ignore',
    '.agentsmesh/mcp.json',
    '.agentsmesh/rules/_root.md',
    '.agentsmesh/rules/typescript.md',
    '.agentsmesh/skills/api-generator/SKILL.md',
    '.agentsmesh/skills/api-generator/references/route-checklist.md',
    '.agentsmesh/skills/api-generator/template.ts',
  ],
};
