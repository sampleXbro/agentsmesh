import type { TargetPathContract } from './types.js';

export const codebuffContract: TargetPathContract = {
  generated: [
    '.agents/mcp.json',
    '.agents/skills/am-command-review/SKILL.md',
    '.agents/skills/api-generator/SKILL.md',
    '.agents/skills/api-generator/references/route-checklist.md',
    '.agents/skills/api-generator/template.ts',
    '.codebuffignore',
    'AGENTS.md',
    'src/AGENTS.md',
  ],
  imported: [
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
