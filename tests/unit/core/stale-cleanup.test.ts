import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupStaleGeneratedOutputs } from '../../../src/core/generate/stale-cleanup.js';

const TEST_ROOT = join(tmpdir(), 'agentsmesh-stale-cleanup-test');

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('cleanupStaleGeneratedOutputs', () => {
  it('removes stale managed outputs and preserves expected or unrelated files', async () => {
    mkdirSync(join(TEST_ROOT, '.codex', 'instructions'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.agents', 'skills', 'review'), { recursive: true });

    writeFileSync(join(TEST_ROOT, 'AGENTS.md'), 'keep');
    writeFileSync(join(TEST_ROOT, '.codex', 'config.toml'), 'keep');
    writeFileSync(join(TEST_ROOT, '.codex', 'instructions', 'old.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.agents', 'skills', 'review', 'SKILL.md'), 'stale');
    writeFileSync(join(TEST_ROOT, 'README.md'), 'unrelated');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['codex-cli'],
      expectedPaths: ['AGENTS.md', '.codex/config.toml'],
    });

    expect(existsSync(join(TEST_ROOT, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.codex', 'config.toml'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.codex', 'instructions', 'old.md'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.agents', 'skills', 'review', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, 'README.md'))).toBe(true);
  });

  it('removes legacy project .claude/CLAUDE.md when root CLAUDE.md is generated', async () => {
    mkdirSync(join(TEST_ROOT, '.claude'), { recursive: true });
    writeFileSync(join(TEST_ROOT, 'CLAUDE.md'), 'root');
    writeFileSync(join(TEST_ROOT, '.claude', 'CLAUDE.md'), 'legacy');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['claude-code'],
      expectedPaths: ['CLAUDE.md'],
    });

    expect(existsSync(join(TEST_ROOT, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.claude', 'CLAUDE.md'))).toBe(false);
  });

  it('uses global managed outputs for Claude global cleanup', async () => {
    mkdirSync(join(TEST_ROOT, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.claude', 'CLAUDE.md'), 'keep');
    writeFileSync(join(TEST_ROOT, '.claude', 'commands', 'old.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.claude.json'), '{}');
    writeFileSync(join(TEST_ROOT, '.mcp.json'), '{}');
    writeFileSync(join(TEST_ROOT, '.claudeignore'), 'node_modules');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['claude-code'],
      expectedPaths: ['.claude/CLAUDE.md'],
      scope: 'global',
    });

    expect(existsSync(join(TEST_ROOT, '.claude', 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.claude', 'commands', 'old.md'))).toBe(false);
    // Co-owned: `~/.claude.json` is Claude Code's own account/history file.
    expect(existsSync(join(TEST_ROOT, '.claude.json'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.mcp.json'))).toBe(true);
    // A legacy ignore file is no longer owned or deleted by AgentsMesh.
    expect(existsSync(join(TEST_ROOT, '.claudeignore'))).toBe(true);
  });

  it('uses Antigravity global managed outputs for cleanup', async () => {
    mkdirSync(join(TEST_ROOT, '.gemini', 'config', 'skills', 'review'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.gemini', 'antigravity', 'global_workflows'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.gemini', 'GEMINI.md'), 'keep');
    writeFileSync(join(TEST_ROOT, '.gemini', 'config', 'skills', 'review', 'SKILL.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.gemini', 'config', 'mcp_config.json'), '{}');
    writeFileSync(
      join(TEST_ROOT, '.gemini', 'antigravity', 'global_workflows', 'deploy.md'),
      'stale',
    );
    writeFileSync(join(TEST_ROOT, '.gemini', 'notes.md'), 'unrelated');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['antigravity'],
      expectedPaths: ['.gemini/GEMINI.md'],
      scope: 'global',
    });

    expect(existsSync(join(TEST_ROOT, '.gemini', 'GEMINI.md'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.gemini', 'config', 'skills', 'review', 'SKILL.md'))).toBe(
      false,
    );
    // Co-owned: Antigravity's UI writes per-server keys into this file.
    expect(existsSync(join(TEST_ROOT, '.gemini', 'config', 'mcp_config.json'))).toBe(true);
    expect(
      existsSync(join(TEST_ROOT, '.gemini', 'antigravity', 'global_workflows', 'deploy.md')),
    ).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.gemini', 'notes.md'))).toBe(true);
  });

  it('uses Cursor global managed outputs for cleanup', async () => {
    mkdirSync(join(TEST_ROOT, '.agentsmesh-exports', 'cursor'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.cursor', 'rules'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.cursor', 'skills', 'review'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.cursor', 'agents'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.cursor', 'commands'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.cursor', 'rules', 'general.mdc'), 'keep');
    writeFileSync(join(TEST_ROOT, '.agentsmesh-exports', 'cursor', 'user-rules.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.cursor', 'skills', 'review', 'SKILL.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.cursor', 'agents', 'reviewer.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.cursor', 'commands', 'ship.md'), 'stale');
    writeFileSync(join(TEST_ROOT, '.cursor', 'mcp.json'), '{}');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['cursor'],
      expectedPaths: ['.cursor/rules/general.mdc'],
      scope: 'global',
    });

    expect(existsSync(join(TEST_ROOT, '.cursor', 'rules', 'general.mdc'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.agentsmesh-exports', 'cursor', 'user-rules.md'))).toBe(
      false,
    );
    expect(existsSync(join(TEST_ROOT, '.cursor', 'skills', 'review', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.cursor', 'agents', 'reviewer.md'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.cursor', 'commands', 'ship.md'))).toBe(false);
    // `.cursor/mcp.json` is what Cursor's MCP panel writes, so it is co-owned
    // and cleanup must leave it alone.
    expect(existsSync(join(TEST_ROOT, '.cursor', 'mcp.json'))).toBe(true);
  });

  it('uses Codex global managed outputs for cleanup', async () => {
    mkdirSync(join(TEST_ROOT, '.codex', 'agents'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.codex', 'rules'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.agents', 'skills', 'review'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.codex', 'AGENTS.md'), 'keep');
    writeFileSync(join(TEST_ROOT, '.codex', 'config.toml'), 'keep');
    writeFileSync(join(TEST_ROOT, '.codex', 'agents', 'reviewer.toml'), 'stale');
    writeFileSync(join(TEST_ROOT, '.codex', 'rules', 'old.rules'), 'stale');
    writeFileSync(join(TEST_ROOT, '.agents', 'skills', 'review', 'SKILL.md'), 'stale');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['codex-cli'],
      expectedPaths: ['.codex/AGENTS.md', '.codex/config.toml'],
      scope: 'global',
    });

    expect(existsSync(join(TEST_ROOT, '.codex', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.codex', 'config.toml'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.codex', 'agents', 'reviewer.toml'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.codex', 'rules', 'old.rules'))).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.agents', 'skills', 'review', 'SKILL.md'))).toBe(false);
  });
});

/**
 * A co-owned file is one agentsmesh writes keys into but the user owns (their
 * model, auth, editor and provider settings live in the same file). A run that
 * stops emitting it — because the feature that wrote it was disabled — must
 * leave it exactly where it is.
 */
describe('cleanupStaleGeneratedOutputs — co-owned files', () => {
  it('keeps the Codex project config when the run emits nothing for it', async () => {
    mkdirSync(join(TEST_ROOT, '.codex'), { recursive: true });
    writeFileSync(join(TEST_ROOT, 'AGENTS.md'), 'root');
    writeFileSync(join(TEST_ROOT, '.codex', 'config.toml'), 'model = "gpt-5.4"\n');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['codex-cli'],
      expectedPaths: ['AGENTS.md'],
    });

    expect(existsSync(join(TEST_ROOT, '.codex', 'config.toml'))).toBe(true);
    expect(readFileSync(join(TEST_ROOT, '.codex', 'config.toml'), 'utf8')).toBe(
      'model = "gpt-5.4"\n',
    );
  });

  it('keeps the Claude global account file when the run emits nothing for it', async () => {
    mkdirSync(join(TEST_ROOT, '.claude'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.claude', 'CLAUDE.md'), 'root');
    writeFileSync(join(TEST_ROOT, '.claude.json'), '{"oauthAccount":{"accountUuid":"abc"}}');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['claude-code'],
      expectedPaths: ['.claude/CLAUDE.md'],
      scope: 'global',
    });

    expect(existsSync(join(TEST_ROOT, '.claude.json'))).toBe(true);
    expect(readFileSync(join(TEST_ROOT, '.claude.json'), 'utf8')).toBe(
      '{"oauthAccount":{"accountUuid":"abc"}}',
    );
  });

  it('still deletes the agentsmesh-owned goose plugin MCP sidecar', async () => {
    mkdirSync(join(TEST_ROOT, '.agents', 'plugins', 'agentsmesh'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.agents', 'plugins', 'agentsmesh', '.mcp.json'), '{}');

    await cleanupStaleGeneratedOutputs({
      projectRoot: TEST_ROOT,
      targets: ['goose'],
      expectedPaths: [],
    });

    expect(existsSync(join(TEST_ROOT, '.agents', 'plugins', 'agentsmesh', '.mcp.json'))).toBe(
      false,
    );
  });
});
