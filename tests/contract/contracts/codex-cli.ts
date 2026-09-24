import type { TargetPathContract } from './types.js';

export const codexCliContract: TargetPathContract = {
  generated: [
    '.agents/skills/am-command-review/SKILL.md',
    '.agents/skills/api-generator/SKILL.md',
    '.agents/skills/api-generator/references/route-checklist.md',
    '.agents/skills/api-generator/template.ts',
    '.codex/agents/code-reviewer.toml',
    '.codex/agents/researcher.toml',
    '.codex/config.toml',
    '.codex/hooks.json',
    '.codex/rules/agentsmesh-permissions.rules',
    'AGENTS.md',
    'src/AGENTS.md',
  ],
  imported: [
    '.agentsmesh/agents/code-reviewer.md',
    '.agentsmesh/agents/researcher.md',
    '.agentsmesh/commands/review.md',
    '.agentsmesh/hooks.yaml',
    '.agentsmesh/mcp.json',
    '.agentsmesh/permissions.yaml',
    '.agentsmesh/rules/_root.md',
    '.agentsmesh/rules/typescript.md',
    '.agentsmesh/skills/api-generator/SKILL.md',
    '.agentsmesh/skills/api-generator/references/route-checklist.md',
    '.agentsmesh/skills/api-generator/template.ts',
  ],
};
