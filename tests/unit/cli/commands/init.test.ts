/**
 * Unit tests for agentsmesh init (including Smart Init / Story 5.2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit, detectExistingConfigs } from '../../../../src/cli/commands/init.js';
import { resolveScopeContext } from '../../../../src/config/core/scope.js';

const TEST_DIR = join(tmpdir(), 'am-init-test');
/**
 * `init` consults the home directory to see which tools the developer has
 * installed. Pin it to an empty dir so target selection is deterministic and
 * does not depend on whose machine the suite runs on; tests that need machine
 * detection re-stub HOME themselves.
 */
const EMPTY_HOME = join(tmpdir(), 'am-init-test-empty-home');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(EMPTY_HOME, { recursive: true });
  vi.stubEnv('HOME', EMPTY_HOME);
  vi.stubEnv('USERPROFILE', EMPTY_HOME);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(TEST_DIR, { recursive: true, force: true });
  rmSync(EMPTY_HOME, { recursive: true, force: true });
});

describe('detectExistingConfigs', () => {
  it('returns empty when no AI configs present', async () => {
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toEqual([]);
  });

  it('detects Claude Code (CLAUDE.md)', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('claude-code');
  });

  it('detects Cursor (.cursor/rules/)', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('cursor');
  });

  it('detects Copilot (.github/copilot-instructions.md)', async () => {
    mkdirSync(join(TEST_DIR, '.github'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.github', 'copilot-instructions.md'), '# Copilot');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('copilot');
  });

  it('detects Copilot (.github/prompts/*.prompt.md)', async () => {
    mkdirSync(join(TEST_DIR, '.github', 'prompts'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.github', 'prompts', 'review.prompt.md'), 'Review prompt');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('copilot');
  });

  it('detects Continue (.continue/rules/)', async () => {
    mkdirSync(join(TEST_DIR, '.continue', 'rules'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('continue');
  });

  it('detects Continue (.continue/skills/)', async () => {
    mkdirSync(join(TEST_DIR, '.continue', 'skills', 'api-gen'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('continue');
  });

  it('detects Junie (.junie/guidelines.md)', async () => {
    mkdirSync(join(TEST_DIR, '.junie'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.junie', 'guidelines.md'), '# Junie');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('junie');
  });

  it('detects Junie (.junie/skills/)', async () => {
    mkdirSync(join(TEST_DIR, '.junie', 'skills', 'api-gen'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('junie');
  });

  it('detects Gemini (GEMINI.md)', async () => {
    writeFileSync(join(TEST_DIR, 'GEMINI.md'), '# Gemini');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('gemini-cli');
  });

  it('detects Cline (.clinerules)', async () => {
    mkdirSync(join(TEST_DIR, '.clinerules'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('cline');
  });

  it('detects Codex (codex.md)', async () => {
    writeFileSync(join(TEST_DIR, 'codex.md'), '# Codex');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('codex-cli');
  });

  it('detects Windsurf (.windsurfrules)', async () => {
    writeFileSync(join(TEST_DIR, '.windsurfrules'), '# Windsurf');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('windsurf');
  });

  it('detects multiple tools', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '');
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found).toContain('claude-code');
    expect(found).toContain('cursor');
  });

  it('deduplicates tools detected by multiple paths', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cursor', 'mcp.json'), '{}');
    const found = await detectExistingConfigs(TEST_DIR);
    expect(found.filter((t) => t === 'cursor')).toHaveLength(1);
  });
});

describe('runInit — structured result', () => {
  it('returns InitCommandResult with correct shape for fresh project', async () => {
    const result = await runInit(TEST_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('project');
    expect(result.data.configFile).toBe('agentsmesh.yaml');
    expect(result.data.localConfigFile).toBe('agentsmesh.local.yaml');
    expect(result.data.imported).toEqual([]);
    expect(result.data.scaffoldType).toBe('full');
    expect(result.data.gitignoreUpdated).toBe(true);
  });

  it('returns scaffoldType gap-fill when --yes with existing configs', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    const result = await runInit(TEST_DIR, { yes: true });
    expect(result.data.scaffoldType).toBe('gap-fill');
    expect(result.data.imported.length).toBeGreaterThan(0);
  });

  it('returns scaffoldType full when existing configs but no --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    const result = await runInit(TEST_DIR);
    expect(result.data.scaffoldType).toBe('full');
    expect(result.data.imported).toEqual([]);
  });

  it('returns gitignoreUpdated false in global mode', async () => {
    const homeDir = join(TEST_DIR, 'home');
    mkdirSync(homeDir, { recursive: true });
    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('USERPROFILE', homeDir);
    const result = await runInit(join(TEST_DIR, 'workspace'), { global: true });
    expect(result.data.scope).toBe('global');
    expect(result.data.gitignoreUpdated).toBe(false);
  });
});

describe('runInit — scaffold (no existing configs)', () => {
  it('creates agentsmesh.yaml with the minimal set when nothing is detected', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(content).toContain('version: 1');
    expect(content).toContain('claude-code');
    expect(content).toContain('cursor');
    expect(content).toContain('copilot');
    // Nothing was detected, so breadth is not assumed.
    expect(content).not.toContain('continue');
    expect(content).not.toContain('junie');
    expect(content).not.toContain('kiro');
    expect(content).not.toContain('codex-cli');
    expect(content).toContain('rules');
  });

  it('creates .agentsmesh/rules/_root.md', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).toContain('description');
  });

  it('creates .agentsmesh/rules/_example.md', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_example.md'))).toBe(true);
  });

  it('creates .agentsmesh/commands/_example.md', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', '_example.md'))).toBe(true);
  });

  it('creates .agentsmesh/agents/_example.md', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'agents', '_example.md'))).toBe(true);
  });

  it('creates .agentsmesh/skills/_example/SKILL.md', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'skills', '_example', 'SKILL.md'))).toBe(true);
  });

  it('creates .agentsmesh/mcp.json', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'))).toBe(true);
  });

  it('creates .agentsmesh/hooks.yaml', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'))).toBe(true);
  });

  it('creates .agentsmesh/permissions.yaml', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'))).toBe(true);
  });

  it('creates .agentsmesh/ignore', async () => {
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'ignore'))).toBe(true);
  });

  it('creates agentsmesh.local.yaml template', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.local.yaml'), 'utf-8');
    expect(content).toContain('targets');
    expect(content).toContain('overrides');
    expect(content).toContain('conversions');
  });

  it('appends to .gitignore if file exists', async () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), 'node_modules\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('agentsmesh.local.yaml');
  });

  it('creates .gitignore with entries if missing', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('agentsmesh.local.yaml');
    expect(content).toContain('.agentsmeshcache');
    expect(content).toContain('.agentsmesh/.lock.tmp');
  });

  it('gitignores .agentsmesh/packs/ — packs are materialized from installs.yaml', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('.agentsmesh/packs/');
  });

  it('does NOT gitignore generated target folders — they are committed for fresh-clone UX', async () => {
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    // Spot-check: a few representative target output paths must NOT be in the default .gitignore
    for (const target of ['.claude/', '.cursor/', '.github/copilot-instructions.md', '.gemini/']) {
      expect(content).not.toContain(target);
    }
  });

  it('does not duplicate .gitignore entries', async () => {
    writeFileSync(
      join(TEST_DIR, '.gitignore'),
      'node_modules\nagentsmesh.local.yaml\n.agentsmeshcache\n.agentsmesh/.lock.tmp\n',
    );
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect((content.match(/agentsmesh\.local\.yaml/g) ?? []).length).toBe(1);
    expect((content.match(/\.agentsmeshcache/g) ?? []).length).toBe(1);
    expect((content.match(/\.agentsmesh\/\.lock\.tmp/g) ?? []).length).toBe(1);
  });

  it('does not append .agentsmesh/* children when a broader .agentsmesh/ entry already exists', async () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), 'node_modules\n.agentsmesh/\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect((content.match(/\.agentsmesh\/\.lock\.tmp/g) ?? []).length).toBe(0);
    expect((content.match(/\.agentsmesh\/packs\//g) ?? []).length).toBe(0);
    // But entries outside the broader pattern still get appended.
    expect(content).toContain('agentsmesh.local.yaml');
    expect(content).toContain('.agentsmeshcache');
  });

  it('treats a bare .agentsmesh entry as covering descendants', async () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), '.agentsmesh\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect((content.match(/\.agentsmesh\/\.lock\.tmp/g) ?? []).length).toBe(0);
    expect((content.match(/\.agentsmesh\/packs\//g) ?? []).length).toBe(0);
  });

  it('reports gitignoreUpdated=false when every managed entry is already present', async () => {
    writeFileSync(
      join(TEST_DIR, '.gitignore'),
      'agentsmesh.local.yaml\n.agentsmeshcache\n.agentsmesh/.lock.tmp\n.agentsmesh/packs/\n',
    );
    const result = await runInit(TEST_DIR);
    expect(result.data.gitignoreUpdated).toBe(false);
  });

  it('skips comment-only and blank lines when checking existing gitignore entries', async () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), '# managed by tooling\n\nnode_modules\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('agentsmesh.local.yaml');
    expect(content).toContain('.agentsmesh/packs/');
  });

  it('throws when agentsmesh.yaml already exists', async () => {
    writeFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'version: 1\n');
    await expect(runInit(TEST_DIR)).rejects.toThrow(/already initialized/i);
  });
});

describe('runInit — existing configs detected, no --yes', () => {
  it('creates scaffold (not imported content) when existing configs but no --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('root: true');
    expect(content).not.toContain('# Rules');
  });

  it('creates all scaffold files when existing configs but no --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'agents', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'))).toBe(true);
  });

  it('creates agentsmesh.yaml scoped to the detected tool when no --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(content).toContain('version: 1');
    expect(content).toContain('claude-code');
    // Breadth is no longer the default: an unrelated target is not enabled.
    expect(content).not.toContain('kiro');
    expect(content).not.toContain('codex-cli');
  });

  it('enables the whole starter set only when asked with --all-targets', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR, { allTargets: true });
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(content).toContain('claude-code');
    expect(content).toContain('kiro');
    expect(content).not.toContain('codex-cli');
  });
});

describe('runInit — Smart Init with --yes flag (Story 5.2)', () => {
  it('auto-imports claude-code when --yes and CLAUDE.md exists', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# My Rules\n\nUse TDD.');
    await runInit(TEST_DIR, { yes: true });
    const imported = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(imported).toContain('My Rules');
    expect(imported).toContain('Use TDD.');
    expect(imported).toContain('root: true');
  });

  it('creates agentsmesh.yaml with only detected targets when --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR, { yes: true });
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(content).toContain('claude-code');
    expect(content).not.toContain('gemini-cli');
  });

  it('auto-imports cursor config when --yes and .cursor/ exists', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Cursor Rules\n\nUse TypeScript.');
    await runInit(TEST_DIR, { yes: true });
    const imported = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(imported).toContain('Cursor Rules');
  });

  it('auto-imports multiple tools when --yes and multiple configs detected', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Claude Rules\n');
    writeFileSync(join(TEST_DIR, '.windsurfrules'), 'Use TDD.');
    await runInit(TEST_DIR, { yes: true });
    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('claude-code');
    expect(config).toContain('windsurf');
    expect(config).not.toContain('gemini-cli');
  });

  it('still creates scaffold files (local.yaml, .gitignore) when --yes', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    await runInit(TEST_DIR, { yes: true });
    expect(existsSync(join(TEST_DIR, 'agentsmesh.local.yaml'))).toBe(true);
    const gitignore = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('agentsmesh.local.yaml');
  });

  it('works with --yes when no existing configs (empty project)', async () => {
    await runInit(TEST_DIR, { yes: true });
    const content = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(content).toContain('version: 1');
    expect(content).toContain('claude-code');
  });

  it('appends newline before entry when gitignore has no trailing newline', async () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), 'node_modules');
    await runInit(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules\nagentsmesh.local.yaml');
  });

  it('--yes with detected but empty tool imports 0 files gracefully', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    await runInit(TEST_DIR, { yes: true });
    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('cursor');
    expect(existsSync(join(TEST_DIR, 'agentsmesh.local.yaml'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'))).toBe(true);
  });

  it('fills empty canonical dirs with examples when --yes after import', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Imported Rules\n');
    await runInit(TEST_DIR, { yes: true });
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(content).toContain('Imported Rules');
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_example.md'))).toBe(false);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'agents', '_example.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'skills', '_example', 'SKILL.md'))).toBe(true);
  });

  it('does not create commands example when --yes and commands were imported', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    mkdirSync(join(TEST_DIR, '.claude', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'commands', 'ship.md'),
      '---\ndescription: Ship\n---\n\nRun release.',
    );
    await runInit(TEST_DIR, { yes: true });
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'commands', '_example.md'))).toBe(false);
  });

  it('does not create agents example when --yes and agents were imported', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    mkdirSync(join(TEST_DIR, '.claude', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'agents', 'reviewer.md'),
      '---\ndescription: Reviewer\n---\n\nReview code.',
    );
    await runInit(TEST_DIR, { yes: true });
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'agents', '_example.md'))).toBe(false);
  });

  it('does not create skills example when --yes and skills were imported', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    mkdirSync(join(TEST_DIR, '.claude', 'skills', 'lint-fix'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'skills', 'lint-fix', 'SKILL.md'),
      '---\nname: lint-fix\ndescription: Lint\n---\n\n# Skill\n',
    );
    await runInit(TEST_DIR, { yes: true });
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'skills', 'lint-fix', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'skills', '_example', 'SKILL.md'))).toBe(false);
  });

  it('does not replace mcp.json with starter template when import wrote MCP', async () => {
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Rules\n');
    writeFileSync(
      join(TEST_DIR, '.mcp.json'),
      JSON.stringify({ mcpServers: { echo: { command: 'echo', args: [] } } }, null, 2),
    );
    await runInit(TEST_DIR, { yes: true });
    const mcp = readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8');
    expect(mcp).toContain('"echo"');
    expect(mcp).toContain('echo');
  });

  it('adds _root but not rules example when --yes imports only scoped claude rules', async () => {
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'rules', 'typescript.md'),
      '---\ndescription: TS\nglobs: ["src/**/*.ts"]\n---\n\nStrict types.',
    );
    await runInit(TEST_DIR, { yes: true });
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_example.md'))).toBe(false);
    const root = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('root: true');
    expect(root).toContain('Project Rules');
  });
});

describe('runInit — global mode', () => {
  it('creates canonical home config under ~/.agentsmesh when global is set', async () => {
    const homeDir = join(TEST_DIR, 'home');
    mkdirSync(homeDir, { recursive: true });
    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('USERPROFILE', homeDir);

    const options = { global: true };
    await runInit(join(TEST_DIR, 'workspace'), options);

    expect(existsSync(join(homeDir, '.agentsmesh', 'agentsmesh.yaml'))).toBe(true);
    expect(existsSync(join(homeDir, '.agentsmesh', 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(homeDir, '.agentsmesh', 'agentsmesh.local.yaml'))).toBe(true);
    expect(existsSync(join(homeDir, '.gitignore'))).toBe(false);
  });

  it('non-interactive global init (no prompter, no --yes) writes the global agentsmesh.yaml', async () => {
    const homeDir = join(TEST_DIR, 'home');
    mkdirSync(homeDir, { recursive: true });
    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('USERPROFILE', homeDir);

    const result = await runInit(join(TEST_DIR, 'workspace'), { global: true });

    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');
    const globalConfigDir = resolveScopeContext(join(TEST_DIR, 'workspace'), 'global').configDir;
    expect(globalConfigDir).toBe(join(homeDir, '.agentsmesh'));
    expect(existsSync(join(globalConfigDir, 'agentsmesh.yaml'))).toBe(true);
    expect(result.data.detectedConfigs).toEqual([]);
  });

  it('non-interactive global init filters detected configs to global-capable ids', async () => {
    const homeDir = join(TEST_DIR, 'home');
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    writeFileSync(join(homeDir, '.claude', 'CLAUDE.md'), '# Global Rules\n');
    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('USERPROFILE', homeDir);

    // Sanity: detection in global scope sees the pre-created claude-code config.
    const detected = await detectExistingConfigs(homeDir, 'global');
    expect(detected).toContain('claude-code');

    const result = await runInit(join(TEST_DIR, 'workspace'), { global: true });

    expect(result.exitCode).toBe(0);
    expect(result.data.scope).toBe('global');
    // The line-76 filter keeps only global-capable ids; claude-code qualifies.
    expect(result.data.detectedConfigs).toEqual(['claude-code']);
    const globalConfigDir = resolveScopeContext(join(TEST_DIR, 'workspace'), 'global').configDir;
    expect(existsSync(join(globalConfigDir, 'agentsmesh.yaml'))).toBe(true);
  });
});

describe('runInit — lessons-only retrofit (already initialized)', () => {
  it('retrofits lessons via runInit on an already-initialized project', async () => {
    const projectRoot = join(TEST_DIR, 'retrofit');
    mkdirSync(projectRoot, { recursive: true });
    // Pre-existing init WITHOUT lessons.
    writeFileSync(join(projectRoot, 'agentsmesh.yaml'), 'version: 1\ntargets:\n  - claude-code\n');

    const result = await runInit(projectRoot, { lessons: true });

    expect(result.exitCode).toBe(0);
    expect(result.data.lessonsOnly).toBe(true);
    expect(result.data.lessons).toBeDefined();
    expect(result.data.scaffoldType).toBe('none');
    expect(result.data.imported).toEqual([]);
    expect(result.data.detectedConfigs).toEqual([]);
    expect(result.data.gitignoreUpdated).toBe(false);
    // Retrofit actually scaffolded the lessons graph in the project tree.
    expect(existsSync(join(projectRoot, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(true);
  });
});
