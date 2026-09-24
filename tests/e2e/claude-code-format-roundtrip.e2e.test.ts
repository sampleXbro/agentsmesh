import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createCanonicalProject } from './helpers/canonical.js';
import { cleanup } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';

describe('claude-code doc format roundtrip', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('generates Claude files in doc-aligned formats', async () => {
    dir = createCanonicalProject(
      'version: 1\ntargets: [claude-code]\nfeatures: [rules,commands,agents,skills,mcp,hooks,ignore,permissions]\n',
    );

    const result = await runCli('generate --targets claude-code', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    const claudeRoot = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(claudeRoot).toContain('# Standards');
    expect(claudeRoot).not.toContain('root: true');

    const rule = readFileSync(join(dir, '.claude', 'rules', 'typescript.md'), 'utf-8');
    expect(rule).toContain('description: TypeScript specific rules');
    // `paths` is the only field Claude Code reads from a rule (#137).
    expect(rule).toContain('paths:\n  - src/**/*.ts');
    expect(rule).not.toContain('globs:');
    expect(rule).toContain('# TypeScript');

    const command = readFileSync(join(dir, '.claude', 'commands', 'review.md'), 'utf-8');
    expect(command).toContain('description: Code review');
    expect(command).toContain('allowed-tools:');
    expect(command).toContain('Review current changes for quality.');

    const agent = readFileSync(join(dir, '.claude', 'agents', 'code-reviewer.md'), 'utf-8');
    expect(agent).toContain('name: code-reviewer');
    expect(agent).toContain('description: Code review specialist');
    expect(agent).toContain('tools:');
    expect(agent).toContain('model: sonnet');
    expect(agent).toContain('permissionMode: ask');
    expect(agent).toContain('maxTurns: 10');

    const skill = readFileSync(
      join(dir, '.claude', 'skills', 'api-generator', 'SKILL.md'),
      'utf-8',
    );
    expect(skill).toContain('description: Generate API endpoints');
    expect(skill).toContain('# API Generator');
    expect(
      existsSync(
        join(dir, '.claude', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      ),
    ).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'api-generator', 'template.ts'))).toBe(true);

    const settings = JSON.parse(
      readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(settings.permissions).toBeDefined();
    expect(settings.hooks).toBeDefined();
    const hooks = settings.hooks as Record<string, unknown>;
    expect(hooks.PostToolUse).toBeDefined();

    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(mcp.mcpServers).toBeDefined();

    expect(readFileSync(join(dir, '.claudeignore'), 'utf-8')).toContain('node_modules');

    // Per doc recommendations, these are optional and should not be emitted by default.
    expect(existsSync(join(dir, '.claude', 'settings.local.json'))).toBe(false);
    expect(existsSync(join(dir, '.claude', 'agent-memory'))).toBe(false);
    expect(existsSync(join(dir, '.claude', 'agent-memory-local'))).toBe(false);
  });

  it('round-trips generated Claude files back to canonical with expected metadata', async () => {
    dir = createCanonicalProject(
      'version: 1\ntargets: [claude-code]\nfeatures: [rules,commands,agents,skills,mcp,hooks,ignore,permissions]\n',
    );

    const generateResult = await runCli('generate --targets claude-code', dir);
    expect(generateResult.exitCode, generateResult.stderr).toBe(0);

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });

    const importResult = await runCli('import --from claude-code', dir);
    expect(importResult.exitCode, importResult.stderr).toBe(0);

    const canonicalRoot = readFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(canonicalRoot).toContain('root: true');
    expect(canonicalRoot).toContain('# Standards');

    const canonicalRule = readFileSync(join(dir, '.agentsmesh', 'rules', 'typescript.md'), 'utf-8');
    expect(canonicalRule).toContain('root: false');
    expect(canonicalRule).toContain('description: TypeScript specific rules');
    expect(canonicalRule).toContain('globs:');

    const canonicalCommand = readFileSync(
      join(dir, '.agentsmesh', 'commands', 'review.md'),
      'utf-8',
    );
    expect(canonicalCommand).toContain('description: Code review');
    expect(canonicalCommand).toContain('allowed-tools:');

    const canonicalAgent = readFileSync(
      join(dir, '.agentsmesh', 'agents', 'code-reviewer.md'),
      'utf-8',
    );
    expect(canonicalAgent).toContain('description: Code review specialist');
    expect(canonicalAgent).toContain('tools:');
    expect(canonicalAgent).toContain('model: sonnet');

    const canonicalSkill = readFileSync(
      join(dir, '.agentsmesh', 'skills', 'api-generator', 'SKILL.md'),
      'utf-8',
    );
    expect(canonicalSkill).toContain('description: Generate API endpoints');
    expect(canonicalSkill).toContain('# API Generator');

    const canonicalPermissions = readFileSync(
      join(dir, '.agentsmesh', 'permissions.yaml'),
      'utf-8',
    );
    expect(canonicalPermissions).toContain('allow:');
    expect(canonicalPermissions).toContain('deny:');

    const canonicalHooks = readFileSync(join(dir, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(canonicalHooks).toContain('PostToolUse:');
    expect(canonicalHooks).toContain('matcher:');
    expect(canonicalHooks).toContain('command:');

    const canonicalMcp = JSON.parse(
      readFileSync(join(dir, '.agentsmesh', 'mcp.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(canonicalMcp.mcpServers).toBeDefined();

    expect(readFileSync(join(dir, '.agentsmesh', 'ignore'), 'utf-8')).toContain('node_modules');
  });
});
