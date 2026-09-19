import { describe, expect, it } from 'vitest';
import {
  AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH,
  appendAgentsmeshRootInstructionParagraph,
} from '../../../src/targets/projection/root-instruction-paragraph.js';

describe('appendAgentsmeshRootInstructionParagraph', () => {
  const CURRENT_BODY_SNIPPET = '`agentsmesh.yaml` to change targets and features';
  const CURRENT_PROHIBITION_SNIPPET = '**NEVER edit generated files**';
  const CURRENT_CANONICAL_SNIPPET = 'Edit the canonical source in `.agentsmesh`';

  const LEGACY_BODY_V1 =
    "AgentsMesh is a config sync library for AI coding tools. The only canonical source of truth is `.agentsmesh/`; files emitted into target formats such as `AGENTS.md`, `.claude/`, `.cursor/`, `.junie/`, and similar directories are generated artifacts. When making changes, edit canonical config first, then regenerate and verify the target outputs. Preserve the library's bidirectional contract: import native tool config into canonical form, generate back to target-specific layouts, and keep projected or embedded features round-trippable rather than treating them as plain text exports.";

  const LEGACY_BODY_V2 =
    "AgentsMesh is a config sync library for AI coding tools. The only canonical source of truth is the `.agentsmesh` directory at the project root; files emitted into target formats such as `AGENTS.md`, `.claude/`, `.cursor/`, `.junie/`, and similar directories are generated artifacts. When making changes, edit canonical config first, then regenerate and verify the target outputs. Preserve the library's bidirectional contract: import native tool config into canonical form, generate back to target-specific layouts, and keep projected or embedded features round-trippable rather than treating them as plain text exports.";

  const LEGACY_BODY_V3 =
    'AgentsMesh syncs AI coding tool configuration from a single canonical `.agentsmesh` directory. All target-specific files (`.claude/`, `.cursor/`, `AGENTS.md`, etc.) are generated artifacts — edit canonical config first, then regenerate. The import/generate contract is bidirectional and lossless: embedded or projected features round-trip without data loss.';

  const LEGACY_BODY_V4 =
    "Create agents, skills, commands, rules, hooks, and MCP in `.agentsmesh`, then run `agentsmesh generate` to sync each tool's native files. Edit `.agentsmesh`, not generated outputs.";

  const LEGACY_BODY_V5 =
    'Use Claude-style Markdown in `.agentsmesh`: `agents/*.md`, `commands/*.md`, and `skills/*/SKILL.md`; keep rules in `rules/*.md`, hooks in `hooks.yaml`, MCP in `mcp.json`, permissions in `permissions.yaml`, and ignore patterns in `ignore`, then run `agentsmesh generate`.';

  const LEGACY_BODY_V6 =
    'Create canonical files in `.agentsmesh`: `rules/_root.md` and `rules/*.md` are Markdown rules; `commands/*.md`, `agents/*.md`, and `skills/*/SKILL.md` plus supporting files use Claude-style frontmatter Markdown; `mcp.json` is MCP JSON; `hooks.yaml` and `permissions.yaml` are YAML; `ignore` is gitignore-style text. Then run `agentsmesh generate`.';

  const LEGACY_BODY_V7 =
    '`.agentsmesh` is the only folder you edit or add these files in: `rules/_root.md` and `rules/*.md` are Markdown rules; `commands/*.md`, `agents/*.md`, and `skills/*/SKILL.md` plus supporting files use Claude-style frontmatter Markdown; `mcp.json` is MCP JSON; `hooks.yaml` and `permissions.yaml` are YAML; `ignore` is gitignore-style text. Do not edit generated tool files; run `agentsmesh generate`.';

  const LEGACY_BODY_V8 =
    '`agentsmesh.yaml` selects targets/features (`agentsmesh.local.yaml` overrides locally), and `.agentsmesh` is the only place to add or edit canonical items: `rules/_root.md`, `rules/*.md`, `commands/*.md`, `agents/*.md`, `skills/*/SKILL.md` plus supporting files, `mcp.json`, `hooks.yaml`, `permissions.yaml`, and `ignore`; if missing run `agentsmesh init`, use `agentsmesh import --from <tool>` for native configs, `agentsmesh install <source>` or `install --sync` for reusable packs, then run `agentsmesh generate`. Use `diff`, `lint`, `check`, `watch`, `matrix`, and `merge` as needed; never edit generated tool files.';

  const LEGACY_BODY_V9 =
    '`agentsmesh.yaml` selects targets/features (`agentsmesh.local.yaml` overrides locally), and `.agentsmesh` is the only place to add or edit canonical items: `rules/_root.md`, `rules/*.md`, `commands/*.md`, `agents/*.md`, `skills/*/SKILL.md` plus supporting files, `mcp.json`, `hooks.yaml`, `permissions.yaml`, and `ignore`; if missing run `agentsmesh init`, use `agentsmesh import --from <tool>` for native configs, `agentsmesh install <source>` or `install --sync` for reusable packs, then run `agentsmesh generate`. Use `diff`, `lint`, `check`, `watch`, `matrix`, `merge`, and `refresh` as needed; never edit generated tool files.';

  const LEGACY_BODY_V10 =
    '**MUST follow when changing any rule, agent, command, skill, hook, MCP server, permission, or ignore pattern.** `agentsmesh.yaml` selects targets/features (`agentsmesh.local.yaml` overrides locally), and `.agentsmesh` is the only place to add or edit canonical items: `rules/_root.md`, `rules/*.md`, `commands/*.md`, `agents/*.md`, `skills/*/SKILL.md` plus supporting files, `mcp.json`, `hooks.yaml`, `permissions.yaml`, and `ignore`; if missing run `agentsmesh init`, use `agentsmesh import --from <tool>` for native configs, `agentsmesh install <source>` or `install --sync` for reusable packs, then run `agentsmesh generate`. Use `diff`, `lint`, `check`, `watch`, `matrix`, `merge`, and `refresh` as needed; never edit generated tool files.';

  const LEGACY_BODY_V11 =
    '**NEVER edit generated files** (`.claude/`, `.cursor/`, `AGENTS.md`, `.github/copilot-instructions.md`, and similar target outputs) — `agentsmesh generate` overwrites them. **All changes MUST go through `.agentsmesh` first**: edit `rules/_root.md`, `rules/*.md`, `commands/*.md`, `agents/*.md`, `skills/*/SKILL.md` plus supporting files, `mcp.json`, `hooks.yaml`, `permissions.yaml`, and `ignore`; `agentsmesh.yaml` selects targets/features (`agentsmesh.local.yaml` overrides locally); if missing run `agentsmesh init`, use `agentsmesh import --from <tool>` for native configs, `agentsmesh install <source>` or `install --sync` for reusable packs, then run `agentsmesh generate`. Use `diff`, `lint`, `check`, `watch`, `matrix`, `merge`, and `refresh` as needed.';

  it('places the headed section at the top, above existing content', () => {
    const result = appendAgentsmeshRootInstructionParagraph('First');
    expect(result).toBe(`${AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH}\n\nFirst`);
    expect(result.startsWith('<!-- agentsmesh:root-generation-contract:start -->')).toBe(true);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result).toContain('<!-- agentsmesh:root-generation-contract:end -->');
    expect(result).toContain(CURRENT_PROHIBITION_SNIPPET);
    expect(result).toContain(CURRENT_CANONICAL_SNIPPET);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('.agentsmesh/');
  });

  it('does not append the section twice when already present', () => {
    const result = appendAgentsmeshRootInstructionParagraph(
      `First\n\n${AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH}`,
    );
    expect(result.split(CURRENT_BODY_SNIPPET)).toHaveLength(2);
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
  });

  it('relocates an existing end-of-file managed block to the top, refreshed', () => {
    const existing = [
      'First',
      '<!-- agentsmesh:root-generation-contract:start -->',
      '## AgentsMesh Generation Contract',
      '',
      'Old generated text with .agentsmesh/rules/example.md',
      '<!-- agentsmesh:root-generation-contract:end -->',
    ].join('\n');
    const result = appendAgentsmeshRootInstructionParagraph(existing);
    expect(result.match(/agentsmesh:root-generation-contract:start/g)).toHaveLength(1);
    expect(result).toBe(`${AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH}\n\nFirst`);
    expect(result.startsWith('<!-- agentsmesh:root-generation-contract:start -->')).toBe(true);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('Old generated text');
  });

  it('preserves leading frontmatter when placing the block at the top', () => {
    const existing = '---\nroot: true\n---\n\n# Body heading\n\ncontent';
    const result = appendAgentsmeshRootInstructionParagraph(existing);
    expect(result.startsWith('---\nroot: true\n---')).toBe(true);
    expect(result).toBe(
      `---\nroot: true\n---\n\n${AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH}\n\n# Body heading\n\ncontent`,
    );
  });

  it('upgrades the v1 legacy paragraph without a heading', () => {
    const result = appendAgentsmeshRootInstructionParagraph(`First\n\n${LEGACY_BODY_V1}`);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('.agentsmesh/');
  });

  it('replaces the old Project-Specific Rules heading with the current one', () => {
    const oldSection = `## Project-Specific Rules\n\n${LEGACY_BODY_V1}`;
    const result = appendAgentsmeshRootInstructionParagraph(`First\n\n${oldSection}`);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result).not.toContain('## Project-Specific Rules');
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('.agentsmesh/');
  });

  it('upgrades the v1 body under the current heading', () => {
    const oldContract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V1}`;
    const result = appendAgentsmeshRootInstructionParagraph(oldContract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).not.toContain('.agentsmesh/');
    expect(result).toContain(CURRENT_BODY_SNIPPET);
  });

  it('upgrades the v2 body under the current heading', () => {
    const v2Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V2}`;
    const result = appendAgentsmeshRootInstructionParagraph(v2Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('The only canonical source of truth');
  });

  it('upgrades the previous short contract body under the current heading', () => {
    const v3Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V3}`;
    const result = appendAgentsmeshRootInstructionParagraph(v3Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('AgentsMesh syncs AI coding tool configuration');
  });

  it('upgrades the previous creation-guidance body under the current heading', () => {
    const v4Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V4}`;
    const result = appendAgentsmeshRootInstructionParagraph(v4Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('Create agents, skills, commands, rules, hooks, and MCP');
  });

  it('upgrades the previous structure-guidance body under the current heading', () => {
    const v5Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V5}`;
    const result = appendAgentsmeshRootInstructionParagraph(v5Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('Use Claude-style Markdown in `.agentsmesh`');
  });

  it('upgrades the previous canonical-authoring body under the current heading', () => {
    const v6Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V6}`;
    const result = appendAgentsmeshRootInstructionParagraph(v6Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('Create canonical files in `.agentsmesh`');
  });

  it('upgrades the previous edit-surface body under the current heading', () => {
    const v7Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V7}`;
    const result = appendAgentsmeshRootInstructionParagraph(v7Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('`.agentsmesh` is the only folder you edit or add these files in');
  });

  it('upgrades the v8 body (no `refresh`) under the current heading', () => {
    const v8Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V8}`;
    const result = appendAgentsmeshRootInstructionParagraph(v8Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_PROHIBITION_SNIPPET);
    expect(result).toContain(CURRENT_CANONICAL_SNIPPET);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('`matrix`, and `merge` as needed');
  });

  it('upgrades the v9 body (pre-mandate) under the current heading', () => {
    const v9Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V9}`;
    const result = appendAgentsmeshRootInstructionParagraph(v9Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_PROHIBITION_SNIPPET);
    expect(result).toContain(CURRENT_CANONICAL_SNIPPET);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
  });

  it('upgrades the v11 body (the long pre-trim contract) under the current heading', () => {
    const v11Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V11}`;
    const result = appendAgentsmeshRootInstructionParagraph(v11Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_PROHIBITION_SNIPPET);
    expect(result).toContain(CURRENT_CANONICAL_SNIPPET);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    // The enumerations the trim removed must not survive the upgrade.
    expect(result).not.toContain('**All changes MUST go through');
    expect(result).not.toContain('skills/*/SKILL.md');
    expect(result).not.toContain('`matrix`, `merge`, and `refresh`');
  });

  it('keeps the contract short enough to re-read every session', () => {
    // The block is injected into every tool's root instruction, so every agent
    // pays for it on every turn. v11 ran to ~120 words; hold the line well under.
    const body = AGENTSMESH_ROOT_INSTRUCTION_PARAGRAPH.split('## AgentsMesh Generation Contract')[1];
    expect(body).toBeDefined();
    expect(body!.trim().split(/\s+/).length).toBeLessThan(60);
  });

  it('upgrades the v10 body (mandate without prohibition) under the current heading', () => {
    const v10Contract = `First\n\n## AgentsMesh Generation Contract\n\n${LEGACY_BODY_V10}`;
    const result = appendAgentsmeshRootInstructionParagraph(v10Contract);
    expect(result).toContain('## AgentsMesh Generation Contract');
    expect(result.match(/## AgentsMesh Generation Contract/g)).toHaveLength(1);
    expect(result).toContain(CURRENT_PROHIBITION_SNIPPET);
    expect(result).toContain(CURRENT_CANONICAL_SNIPPET);
    expect(result).toContain(CURRENT_BODY_SNIPPET);
    expect(result).not.toContain('**MUST follow when changing');
  });
});
