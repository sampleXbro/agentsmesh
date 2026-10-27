/**
 * Unit tests for agentsmesh import command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runImport } from '../../../../src/cli/commands/import.js';
import { vi } from 'vitest';

const TEST_DIR = join(tmpdir(), 'am-import-cmd-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runImport', () => {
  it('throws when --from is missing', async () => {
    await expect(runImport({}, TEST_DIR)).rejects.toThrow(/required/i);
  });

  it('throws when --from is unknown', async () => {
    await expect(runImport({ from: 'unknown-tool' }, TEST_DIR)).rejects.toThrow(/unknown.*from/i);
  });

  it('imports from claude-code when CLAUDE.md exists', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Root\n');
    const result = await runImport({ from: 'claude-code' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('project');
    expect(result.data.target).toBe('claude-code');
    expect(result.data.files.length).toBeGreaterThan(0);
    expect(result.data.files[0]!.from).toBeDefined();
    expect(result.data.files[0]!.to).toBeDefined();
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Root');
  });

  it('imports from claude-code when .claude/rules exist', async () => {
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'rules', 'ts.md'), '# TS\n');
    const result = await runImport({ from: 'claude-code' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('claude-code');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'), 'utf-8');
    expect(content).toContain('# TS');
  });

  it('imports Claude global config from the user home root when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), '# Global Root\n');
    writeFileSync(
      join(TEST_DIR, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read(*)'], deny: ['Write(/etc/**)'] } }, null, 2),
    );
    writeFileSync(
      join(TEST_DIR, '.claude.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );

    const result = await runImport(
      { from: 'claude-code', global: true },
      join(TEST_DIR, 'worktree'),
    );
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');
    expect(result.data.target).toBe('claude-code');
    expect(result.data.files.length).toBeGreaterThan(0);

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8')).toContain(
      '# Global Root',
    );
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8')).toContain(
      'Read(*)',
    );
    const mcp = JSON.parse(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['docs']);
  });

  it('does not seed the agentsmesh MCP server on a global import', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), '# Global Root\n');

    const result = await runImport(
      { from: 'claude-code', global: true },
      join(TEST_DIR, 'worktree'),
    );

    expect(result.data.files.length).toBeGreaterThan(0);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'))).toBe(false);
  });

  it('seeds the agentsmesh MCP server on a project import', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Root\n');

    await runImport({ from: 'claude-code' }, TEST_DIR);

    const mcp = JSON.parse(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['agentsmesh']);
  });

  it('imports Antigravity global config from documented ~/.gemini paths', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.gemini', 'config', 'skills', 'review'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.gemini', 'GEMINI.md'), '# Antigravity Root\n');
    writeFileSync(
      join(TEST_DIR, '.gemini', 'config', 'skills', 'review', 'SKILL.md'),
      '# Review\n',
    );
    writeFileSync(
      join(TEST_DIR, '.gemini', 'config', 'mcp_config.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );

    const result = await runImport(
      { from: 'antigravity', global: true },
      join(TEST_DIR, 'worktree'),
    );
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');
    expect(result.data.target).toBe('antigravity');
    expect(result.data.files.length).toBeGreaterThan(0);

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8')).toContain(
      '# Antigravity Root',
    );
    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'), 'utf-8'),
    ).toContain('# Review');
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8')).toContain(
      '"mcpServers"',
    );
  });

  it('returns empty files array when nothing to import', async () => {
    const result = await runImport({ from: 'claude-code' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('project');
    expect(result.data.target).toBe('claude-code');
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports from cursor when AGENTS.md exists', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Root\n');
    const result = await runImport({ from: 'cursor' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('cursor');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Root');
  });

  it('imports from cursor when .cursor/rules/*.mdc exist', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'rules', 'ts.mdc'),
      '---\nalwaysApply: false\n---\n\n# TS\n',
    );
    const result = await runImport({ from: 'cursor' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'), 'utf-8');
    expect(content).toContain('# TS');
  });

  it('returns empty files when nothing to import (cursor)', async () => {
    const result = await runImport({ from: 'cursor' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('cursor');
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports Cursor global rules from ~/.cursor/rules/general.mdc when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'rules', 'general.mdc'),
      '---\nalwaysApply: true\ndescription: G\n---\n# Cursor Global\n',
    );

    const result = await runImport({ from: 'cursor', global: true }, join(TEST_DIR, 'worktree'));
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf8')).toContain(
      'Cursor Global',
    );
  });

  it('imports Cursor global mcp from ~/.cursor/mcp.json when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'npx', args: [] } } }, null, 2),
    );

    const result = await runImport({ from: 'cursor', global: true }, join(TEST_DIR, 'worktree'));
    expect(result.exitCode).toBe(0);

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf8')).toContain('mcpServers');
  });

  it('imports Cursor global artifacts from ~/.agentsmesh-exports/cursor and ~/.cursor when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh-exports', 'cursor'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor', 'skills', 'demo'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh-exports', 'cursor', 'user-rules.md'),
      '# Exported rules\n\nUse care.',
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { z: { command: 'npx', args: [] } } }, null, 2),
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: D\n---\nBody',
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'agents', 'reviewer.md'),
      '---\nname: reviewer\ndescription: R\n---\nAgent body',
    );

    const result = await runImport({ from: 'cursor', global: true }, join(TEST_DIR, 'worktree'));
    expect(result.exitCode).toBe(0);
    expect(result.data.files.length).toBeGreaterThan(0);

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf8')).toContain(
      'Exported rules',
    );
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf8')).toContain('mcpServers');
    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'skills', 'demo', 'SKILL.md'), 'utf8'),
    ).toContain('Body');
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'), 'utf8')).toContain(
      'Agent body',
    );
  });

  it('imports from codex-cli when codex.md exists', async () => {
    writeFileSync(join(TEST_DIR, 'codex.md'), '# Codex Rules\n');
    const result = await runImport({ from: 'codex-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('codex-cli');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Codex Rules');
  });

  it('imports from codex-cli when AGENTS.md exists (no codex.md)', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Agents\n');
    const result = await runImport({ from: 'codex-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('# Agents');
  });

  it('prefers AGENTS.md over codex.md when both exist (official Codex path)', async () => {
    writeFileSync(join(TEST_DIR, 'codex.md'), '# From codex\n');
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# From agents\n');
    const result = await runImport({ from: 'codex-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('# From agents');
  });

  it('prefers ~/.codex/AGENTS.override.md over AGENTS.md when importing codex-cli globally', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.codex'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.codex', 'AGENTS.md'), '# From agents\n');
    writeFileSync(join(TEST_DIR, '.codex', 'AGENTS.override.md'), '# From override\n');

    const result = await runImport({ from: 'codex-cli', global: true }, join(TEST_DIR, 'worktree'));
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf8')).toContain(
      'From override',
    );
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf8')).not.toContain(
      'From agents',
    );
  });

  it('imports Codex global config from ~/.codex and ~/.agents when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.codex', 'agents'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agents', 'skills', 'review'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.codex', 'AGENTS.md'), '# Codex Global\n');
    writeFileSync(
      join(TEST_DIR, '.codex', 'config.toml'),
      `[mcp_servers.docs]
command = "npx"
args = ["-y", "@docs/mcp"]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.codex', 'agents', 'reviewer.toml'),
      `name = "reviewer"
description = "Reviewer"
developer_instructions = '''
Review carefully.
'''
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agents', 'skills', 'review', 'SKILL.md'),
      `---
name: review
description: Review changes
---
Review carefully.
`,
    );

    const result = await runImport({ from: 'codex-cli', global: true }, join(TEST_DIR, 'worktree'));
    expect(result.exitCode).toBe(0);
    expect(result.data.files.length).toBeGreaterThan(0);

    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8')).toContain(
      '# Codex Global',
    );
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8')).toContain(
      '"mcpServers"',
    );
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'), 'utf-8')).toContain(
      'Review carefully.',
    );
    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'), 'utf-8'),
    ).toContain('Review carefully.');
  });

  it('returns empty files when nothing to import (codex-cli)', async () => {
    const result = await runImport({ from: 'codex-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('codex-cli');
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports from windsurf when .windsurfrules exists', async () => {
    writeFileSync(join(TEST_DIR, '.windsurfrules'), '# Windsurf Rules\n\nUse TDD.');
    const result = await runImport({ from: 'windsurf' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('windsurf');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Windsurf Rules');
    expect(content).toContain('Use TDD.');
  });

  it('returns empty files when nothing to import (windsurf)', async () => {
    const result = await runImport({ from: 'windsurf' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports from copilot when .github/copilot-instructions.md exists', async () => {
    mkdirSync(join(TEST_DIR, '.github'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'copilot-instructions.md'),
      '# Copilot Global Rules\n- Use TDD',
    );
    const result = await runImport({ from: 'copilot' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('copilot');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Copilot Global Rules');
    expect(content).toContain('Use TDD');
  });

  it('imports from copilot when .github/copilot/*.instructions.md exist', async () => {
    mkdirSync(join(TEST_DIR, '.github', 'copilot'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'copilot', 'review.instructions.md'),
      '---\ndescription: Review\n---\n\nReview body',
    );
    const result = await runImport({ from: 'copilot' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'review.md'), 'utf-8');
    expect(content).toContain('description: Review');
    expect(content).toContain('Review body');
  });

  it('imports from copilot when .github/prompts/*.prompt.md exist', async () => {
    mkdirSync(join(TEST_DIR, '.github', 'prompts'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'prompts', 'review.prompt.md'),
      '---\nagent: agent\ndescription: Review changes\n---\n\nReview body',
    );
    const result = await runImport({ from: 'copilot' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'), 'utf-8');
    expect(content).toContain('description: Review changes');
    expect(content).toContain('Review body');
  });

  it('returns empty files when nothing to import (copilot)', async () => {
    const result = await runImport({ from: 'copilot' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports from gemini-cli when GEMINI.md exists', async () => {
    writeFileSync(join(TEST_DIR, 'GEMINI.md'), '# Gemini Rules\n- Use TDD');
    const result = await runImport({ from: 'gemini-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('gemini-cli');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Gemini Rules');
    expect(content).toContain('Use TDD');
  });

  it('imports from gemini-cli when .gemini/commands exist', async () => {
    mkdirSync(join(TEST_DIR, '.gemini', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.gemini', 'commands', 'lint.md'),
      '---\ndescription: Lint code\n---\n\nRun pnpm lint',
    );
    const result = await runImport({ from: 'gemini-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'commands', 'lint.md'), 'utf-8');
    expect(content).toContain('description: Lint code');
    expect(content).toContain('Run pnpm lint');
  });

  it('returns empty files when nothing to import (gemini-cli)', async () => {
    const result = await runImport({ from: 'gemini-cli' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('imports from cline when .cline/rules/_root.md exists', async () => {
    mkdirSync(join(TEST_DIR, '.cline', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cline', 'rules', '_root.md'), '# Cline Rules\n\nUse TDD.');
    const result = await runImport({ from: 'cline' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.target).toBe('cline');
    expect(result.data.files.length).toBeGreaterThan(0);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('# Cline Rules');
    expect(content).toContain('Use TDD.');
  });

  it('imports from cline when .cline/skills exist', async () => {
    mkdirSync(join(TEST_DIR, '.cline', 'skills', 'review'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cline', 'skills', 'review', 'SKILL.md'),
      '---\ndescription: Code review skill\n---\n\nRun code review.',
    );
    const result = await runImport({ from: 'cline' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    const content = readFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('description: Code review skill');
    expect(content).toContain('Run code review.');
  });

  it('returns empty files when nothing to import (cline)', async () => {
    const result = await runImport({ from: 'cline' }, TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.files).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });
});
