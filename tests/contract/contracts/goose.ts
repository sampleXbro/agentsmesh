import type { TargetPathContract } from './types.js';

export const gooseContract: TargetPathContract = {
  generated: [
    '.agents/plugins/agentsmesh/.mcp.json',
    '.agents/plugins/agentsmesh/hooks/hooks.json',
    '.agents/skills/am-agent-code-reviewer/SKILL.md',
    '.agents/skills/am-agent-researcher/SKILL.md',
    '.agents/skills/am-command-review/SKILL.md',
    '.agents/skills/api-generator/SKILL.md',
    '.agents/skills/api-generator/references/route-checklist.md',
    '.agents/skills/api-generator/template.ts',
    '.goosehints',
  ],
  imported: [
    '.agentsmesh/agents/code-reviewer.md',
    '.agentsmesh/agents/researcher.md',
    '.agentsmesh/commands/review.md',
    '.agentsmesh/hooks.yaml',
    '.agentsmesh/mcp.json',
    '.agentsmesh/rules/_root.md',
    '.agentsmesh/skills/api-generator/SKILL.md',
    '.agentsmesh/skills/api-generator/references/route-checklist.md',
    '.agentsmesh/skills/api-generator/template.ts',
  ],
};
