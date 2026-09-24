# Agents E2E Last Run Report

_Generated: 2026-09-23T10:43:33.179Z_

## Initial — `.agentsmesh/agents/` (canonical fixture)

  - **code-reviewer.md**
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
    - permission  : ask
    - max-turns   : 10
  - **researcher.md**
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch
    - disallowed  : Write, Edit
    - max-turns   : 5

## Target: claude-code

### Generated files

```
✓ created CLAUDE.md
✓ created .claude/rules/typescript.md
✓ created .claude/commands/review.md
✓ created .claude/agents/code-reviewer.md
✓ created .claude/agents/researcher.md
✓ created .claude/skills/api-generator/SKILL.md
✓ created .claude/skills/api-generator/references/route-checklist.md
✓ created .claude/skills/api-generator/template.ts
✓ created .mcp.json
✓ created .claude/settings.json
✓ created .claudeignore
Generated: 11 created, 0 updated, 0 unchanged
┌────────┬───────┬──────────────────┬──────────┬────────┬────────┬─────┬───────┬────────┬─────────────┐
│ Target │ Rules │ Additional Rules │ Commands │ Agents │ Skills │ MCP │ Hooks │ Ignore │ Permissions │
├────────┼───────┼──────────────────┼──────────┼────────┼────────┼─────┼───────┼────────┼─────────────┤
│ Claude │   ✓   │        ✓         │    ✓     │   ✓    │   ✓    │  ✓  │   ✓   │   ✓    │      ✓      │
└────────┴───────┴──────────────────┴──────────┴────────┴────────┴─────┴───────┴────────┴─────────────┘

✓ native  ◆ embedded  ◐ partial  – none
```

#### Agent files in `.claude/agents/`

  - **code-reviewer.md**
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
    - permission  : ask
    - max-turns   : 10
  - **researcher.md**
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch
    - disallowed  : Write, Edit
    - max-turns   : 5

### Imported files

```
✓ CLAUDE.md → .agentsmesh/rules/_root.md
✓ .claude/rules/typescript.md → .agentsmesh/rules/typescript.md
✓ .claude/commands/review.md → .agentsmesh/commands/review.md
✓ .claude/agents/code-reviewer.md → .agentsmesh/agents/code-reviewer.md
✓ .claude/agents/researcher.md → .agentsmesh/agents/researcher.md
✓ .mcp.json → .agentsmesh/mcp.json
✓ .claudeignore → .agentsmesh/ignore
✓ .claude/skills/api-generator/SKILL.md → .agentsmesh/skills/api-generator/SKILL.md
✓ .claude/skills/api-generator/references/route-checklist.md → .agentsmesh/skills/api-generator/references/route-checklist.md
✓ .claude/skills/api-generator/template.ts → .agentsmesh/skills/api-generator/template.ts
✓ .claude/settings.json → .agentsmesh/permissions.yaml
✓ .claude/settings.json → .agentsmesh/hooks.yaml
Imported 12 file(s). Run 'agentsmesh generate' to sync to other tools.
```

#### Canonical `.agentsmesh/agents/` after import

  - **code-reviewer.md**
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
    - permission  : ask
    - max-turns   : 10
  - **researcher.md**
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch
    - disallowed  : Write, Edit
    - max-turns   : 5

## Target: cursor

### Generated files

```
✓ created AGENTS.md
✓ created .cursor/rules/general.mdc
✓ created .cursor/rules/typescript.mdc
✓ created .cursor/AGENTS.md
✓ created .cursor/commands/review.md
✓ created .cursor/agents/code-reviewer.md
✓ created .cursor/agents/researcher.md
✓ created .cursor/skills/api-generator/SKILL.md
✓ created .cursor/skills/api-generator/references/route-checklist.md
✓ created .cursor/skills/api-generator/template.ts
✓ created .cursor/mcp.json
✓ created .cursor/cli.json
✓ created .cursor/hooks.json
✓ created .cursorignore
Generated: 14 created, 0 updated, 0 unchanged
┌────────┬───────┬──────────────────┬──────────┬────────┬────────┬─────┬───────┬────────┬─────────────┐
│ Target │ Rules │ Additional Rules │ Commands │ Agents │ Skills │ MCP │ Hooks │ Ignore │ Permissions │
├────────┼───────┼──────────────────┼──────────┼────────┼────────┼─────┼───────┼────────┼─────────────┤
│ cursor │   ✓   │        ✓         │    ✓     │   ✓    │   ✓    │  ✓  │   ✓   │   ✓    │      ✓      │
└────────┴───────┴──────────────────┴──────────┴────────┴────────┴─────┴───────┴────────┴─────────────┘

✓ native  ◆ embedded  ◐ partial  – none
```

#### Agent files in `.cursor/agents/`

  - **code-reviewer.md**
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
    - permission  : ask
    - max-turns   : 10
  - **researcher.md**
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch
    - disallowed  : Write, Edit
    - max-turns   : 5

### Imported files

```
✓ .cursor/rules/general.mdc → .agentsmesh/rules/_root.md
✓ .cursor/rules/typescript.mdc → .agentsmesh/rules/typescript.md
✓ .cursor/commands/review.md → .agentsmesh/commands/review.md
✓ .cursor/agents/code-reviewer.md → .agentsmesh/agents/code-reviewer.md
✓ .cursor/agents/researcher.md → .agentsmesh/agents/researcher.md
✓ .cursor/skills/api-generator/SKILL.md → .agentsmesh/skills/api-generator/SKILL.md
✓ .cursor/skills/api-generator/references/route-checklist.md → .agentsmesh/skills/api-generator/references/route-checklist.md
✓ .cursor/skills/api-generator/template.ts → .agentsmesh/skills/api-generator/template.ts
✓ .cursor/mcp.json → .agentsmesh/mcp.json
✓ .cursor/hooks.json → .agentsmesh/hooks.yaml
✓ .cursor/cli.json → .agentsmesh/permissions.yaml
✓ .cursorignore → .agentsmesh/ignore
Imported 12 file(s). Run 'agentsmesh generate' to sync to other tools.
```

#### Canonical `.agentsmesh/agents/` after import

  - **code-reviewer.md**
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
    - permission  : ask
    - max-turns   : 10
  - **researcher.md**
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch
    - disallowed  : Write, Edit
    - max-turns   : 5

## Target: copilot (agents in .github/agents/*.agent.md)

### Generated files

```
✓ created .github/copilot-instructions.md
✓ created .github/instructions/typescript.instructions.md
✓ created .github/prompts/review.prompt.md
✓ created .github/agents/code-reviewer.agent.md
✓ created .github/agents/researcher.agent.md
✓ created .github/skills/api-generator/SKILL.md
✓ created .github/skills/api-generator/references/route-checklist.md
✓ created .github/skills/api-generator/template.ts
✓ created .vscode/mcp.json
✓ created .github/hooks/agentsmesh.json
✓ created .github/hooks/scripts/posttooluse-0.sh
Generated: 11 created, 0 updated, 0 unchanged
┌─────────┬───────┬──────────────────┬──────────┬────────┬────────┬─────┬───────┬────────┬─────────────┐
│ Target  │ Rules │ Additional Rules │ Commands │ Agents │ Skills │ MCP │ Hooks │ Ignore │ Permissions │
├─────────┼───────┼──────────────────┼──────────┼────────┼────────┼─────┼───────┼────────┼─────────────┤
│ copilot │   ✓   │        ✓         │    ✓     │   ✓    │   ✓    │  ✓  │   ✓   │   –    │      –      │
└─────────┴───────┴──────────────────┴──────────┴────────┴────────┴─────┴───────┴────────┴─────────────┘

✓ native  ◆ embedded  ◐ partial  – none
```

#### Agents in `.github/agents/*.agent.md`

  - **code-reviewer**: ✓ present
    - description  : Code review specialist
    - body snippet : ✓ present
  - **researcher**: ✓ present
    - description  : Research documentation and summarize findings
    - body snippet : ✓ present

## Embedded agent targets (agents projected into skills)

### windsurf: exit=0

  - **code-reviewer**: ✓ projected to `.windsurf/skills/am-agent-code-reviewer/SKILL.md`
    - description : Code review specialist
    - model       : sonnet
    - tools       : Read, Glob, Grep
  - **researcher**: ✓ projected to `.windsurf/skills/am-agent-researcher/SKILL.md`
    - description : Research documentation and summarize findings
    - model       : haiku
    - tools       : Read, WebSearch, WebFetch

## Native agent targets

### codex-cli: exit=0

  - **code-reviewer**: ✓ `.codex/agents/code-reviewer.toml`
    - description : ✓
    - body snippet: ✓
  - **researcher**: ✓ `.codex/agents/researcher.toml`
    - description : ✓
    - body snippet: ✓
### gemini-cli: exit=0

  - **code-reviewer**: ✓ `.gemini/agents/code-reviewer.md`
    - description : ✓
    - body snippet: ✓
  - **researcher**: ✓ `.gemini/agents/researcher.md`
    - description : ✓
    - body snippet: ✓

## Cline (per-file .cline/agents/{name}.md)

### cline: exit=0

  - (.cline/agents/ directory not found)