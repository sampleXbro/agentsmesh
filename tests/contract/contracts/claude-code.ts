import type { TargetPathContract } from './types.js';

export const claudeCodeContract: TargetPathContract = {
  generated: [
    '.claude/agents/code-reviewer.md',
    '.claude/agents/researcher.md',
    '.claude/commands/review.md',
    '.claude/rules/typescript.md',
    '.claude/settings.json',
    '.claude/skills/api-generator/SKILL.md',
    '.claude/skills/api-generator/references/route-checklist.md',
    '.claude/skills/api-generator/template.ts',
    '.mcp.json',
    'CLAUDE.md',
  ],
  imported: [
    '.agentsmesh/agents/code-reviewer.md',
    '.agentsmesh/agents/researcher.md',
    '.agentsmesh/commands/review.md',
    '.agentsmesh/hooks.yaml',
    '.agentsmesh/ignore',
    '.agentsmesh/mcp.json',
    '.agentsmesh/permissions.yaml',
    '.agentsmesh/rules/_root.md',
    '.agentsmesh/rules/typescript.md',
    '.agentsmesh/skills/api-generator/SKILL.md',
    '.agentsmesh/skills/api-generator/references/route-checklist.md',
    '.agentsmesh/skills/api-generator/template.ts',
  ],
};
