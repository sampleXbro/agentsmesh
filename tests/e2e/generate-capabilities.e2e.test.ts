import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createTestProject } from './helpers/setup.js';
import { createCanonicalProject } from './helpers/canonical.js';
import { runCli } from './helpers/run-cli.js';
import {
  dirFilesExactly,
  fileContains,
  fileExists,
  fileNotExists,
  fileNotContains,
  dirTreeExactly,
  readJson,
  readText,
} from './helpers/assertions.js';
import { markdownFrontmatter } from './helpers/file-shape.js';

describe('generate capabilities', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('does not advertise --features in help output', async () => {
    dir = createTestProject();
    const result = await runCli('--help', dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('--features');
  });

  it('rejects generate --features', async () => {
    dir = createTestProject('canonical-full');
    const result = await runCli('generate --features rules', dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--features|unknown flag/i);
  });

  it('generates Copilot prompt files and current contextual rule files', async () => {
    dir = createCanonicalProject();
    const result = await runCli('generate --targets copilot', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'x-agentsmesh-kind: command');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'x-agentsmesh-name: review');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'Review current changes');
    fileExists(join(dir, '.github', 'instructions', 'typescript.instructions.md'));
    fileContains(join(dir, '.github', 'instructions', 'typescript.instructions.md'), 'applyTo');
    dirFilesExactly(join(dir, '.github', 'hooks'), ['agentsmesh.json', 'scripts/posttooluse-0.sh']);
    const hooks = readJson(join(dir, '.github', 'hooks', 'agentsmesh.json'));
    expect(hooks).toEqual({
      version: 1,
      hooks: {
        postToolUse: [
          {
            type: 'command',
            bash: './scripts/posttooluse-0.sh',
            matcher: 'Write|Edit',
          },
        ],
      },
    });
  });

  it('generates the exact Copilot hook wrapper set for all supported hook events', async () => {
    dir = createTestProject();
    mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [copilot]\nfeatures: [rules, hooks]\n',
    );
    writeFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
    writeFileSync(
      join(dir, '.agentsmesh', 'hooks.yaml'),
      [
        'PreToolUse:',
        '  - matcher: Bash',
        '    command: echo pre',
        'PostToolUse:',
        '  - matcher: Write',
        '    command: echo post',
        'Notification:',
        '  - matcher: ".*"',
        '    command: echo notify',
        'UserPromptSubmit:',
        '  - matcher: ".*"',
        '    command: echo prompt',
        '',
      ].join('\n'),
    );

    const result = await runCli('generate --targets copilot', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirFilesExactly(join(dir, '.github', 'hooks'), [
      'agentsmesh.json',
      'scripts/notification-0.sh',
      'scripts/posttooluse-0.sh',
      'scripts/pretooluse-0.sh',
      'scripts/userpromptsubmit-0.sh',
    ]);

    const hooks = readJson(join(dir, '.github', 'hooks', 'agentsmesh.json'));
    expect(hooks).toEqual({
      version: 1,
      hooks: {
        preToolUse: [
          {
            type: 'command',
            bash: './scripts/pretooluse-0.sh',
            matcher: 'Bash',
          },
        ],
        postToolUse: [
          {
            type: 'command',
            bash: './scripts/posttooluse-0.sh',
            matcher: 'Write',
          },
        ],
        notification: [
          {
            type: 'command',
            bash: './scripts/notification-0.sh',
            matcher: '.*',
          },
        ],
        userPromptSubmitted: [
          {
            type: 'command',
            bash: './scripts/userpromptsubmit-0.sh',
            matcher: '.*',
          },
        ],
      },
    });
  });

  it('generates Copilot content format aligned with docs across all emitted files', async () => {
    dir = createCanonicalProject(`version: 1
targets: [copilot]
features: [rules, commands, agents, skills, hooks]
`);

    writeFileSync(
      join(dir, '.agentsmesh', 'agents', 'code-reviewer.md'),
      [
        '---',
        'description: Code review specialist',
        'tools:',
        '  - Read',
        'model: gpt-5',
        'mcp-servers:',
        '  - context7',
        'skills:',
        '  - api-generator',
        '---',
        '',
        'You are a code reviewer.',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'hooks.yaml'),
      [
        'PostToolUse:',
        '  - matcher: Write|Edit',
        '    command: prettier --write $FILE_PATH',
        '    timeout: 1500',
        '',
      ].join('\n'),
    );

    const result = await runCli('generate --targets copilot', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileExists(join(dir, '.github', 'copilot-instructions.md'));
    fileContains(join(dir, '.github', 'copilot-instructions.md'), '# Standards');
    fileNotContains(join(dir, '.github', 'copilot-instructions.md'), 'root: true');

    fileContains(join(dir, '.github', 'instructions', 'typescript.instructions.md'), 'applyTo');
    fileContains(join(dir, '.github', 'instructions', 'typescript.instructions.md'), 'src/**/*.ts');
    fileNotContains(join(dir, '.github', 'instructions', 'typescript.instructions.md'), '\nglobs:');

    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'agent: agent');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'x-agentsmesh-kind: command');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'x-agentsmesh-name: review');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'x-agentsmesh-allowed-tools');
    fileContains(join(dir, '.github', 'prompts', 'review.prompt.md'), 'description: Code review');

    fileContains(
      join(dir, '.github', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.github', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
    fileContains(
      join(dir, '.github', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );

    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'name: code-reviewer');
    fileContains(
      join(dir, '.github', 'agents', 'code-reviewer.agent.md'),
      'description: Code review specialist',
    );
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'tools');
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'model: gpt-5');
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'mcp-servers');
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'context7');
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'skills');
    fileContains(join(dir, '.github', 'agents', 'code-reviewer.agent.md'), 'api-generator');
    fileContains(
      join(dir, '.github', 'agents', 'code-reviewer.agent.md'),
      'You are a code reviewer.',
    );

    const hooks = readJson(join(dir, '.github', 'hooks', 'agentsmesh.json'));
    expect(hooks).toEqual({
      version: 1,
      hooks: {
        postToolUse: [
          {
            type: 'command',
            bash: './scripts/posttooluse-0.sh',
            matcher: 'Write|Edit',
            timeoutSec: 2,
          },
        ],
      },
    });

    fileContains(
      join(dir, '.github', 'hooks', 'scripts', 'posttooluse-0.sh'),
      '#!/usr/bin/env bash',
    );
    fileContains(
      join(dir, '.github', 'hooks', 'scripts', 'posttooluse-0.sh'),
      '# agentsmesh-matcher: Write|Edit',
    );
    fileContains(
      join(dir, '.github', 'hooks', 'scripts', 'posttooluse-0.sh'),
      '# agentsmesh-command: prettier --write $FILE_PATH',
    );
    fileContains(
      join(dir, '.github', 'hooks', 'scripts', 'posttooluse-0.sh'),
      'HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    );

    dirTreeExactly(join(dir, '.github'), [
      'agents/',
      'agents/code-reviewer.agent.md',
      'agents/researcher.agent.md',
      'copilot-instructions.md',
      'hooks/',
      'hooks/agentsmesh.json',
      'hooks/scripts/',
      'hooks/scripts/posttooluse-0.sh',
      'instructions/',
      'instructions/typescript.instructions.md',
      'prompts/',
      'prompts/review.prompt.md',
      'skills/',
      'skills/api-generator/',
      'skills/api-generator/SKILL.md',
      'skills/api-generator/references/',
      'skills/api-generator/references/route-checklist.md',
      'skills/api-generator/template.ts',
    ]);
    expect(readText(join(dir, '.github', 'copilot-instructions.md')).trim().length).toBeGreaterThan(
      0,
    );
    fileNotExists(join(dir, '.github', 'workflows', 'copilot-setup-steps.yml'));
  });

  it.each([
    ['cline', '.clinerules/workflows/review.md'],
    ['windsurf', '.windsurf/workflows/review.md'],
  ] as const)('%s generates workflows from canonical commands', async (target, path) => {
    dir = createCanonicalProject();
    const result = await runCli(`generate --targets ${target}`, dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, path), 'Review current changes');
  });

  it('generates Codex commands as metadata-tagged skills', async () => {
    dir = createCanonicalProject();
    const result = await runCli('generate --targets codex-cli', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(
      join(dir, '.agents', 'skills', 'am-command-review', 'SKILL.md'),
      'x-agentsmesh-kind: command',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'am-command-review', 'SKILL.md'),
      'x-agentsmesh-name: review',
    );
    fileContains(join(dir, '.agents', 'skills', 'am-command-review', 'SKILL.md'), 'Bash(git diff)');
  });

  it.each([
    [
      'claude-code',
      '.claude/skills/api-generator/SKILL.md',
      '.claude/skills/api-generator/references/route-checklist.md',
    ],
    [
      'cursor',
      '.cursor/skills/api-generator/SKILL.md',
      '.cursor/skills/api-generator/references/route-checklist.md',
    ],
    [
      'copilot',
      '.github/skills/api-generator/SKILL.md',
      '.github/skills/api-generator/references/route-checklist.md',
    ],
    [
      'gemini-cli',
      '.gemini/skills/api-generator/SKILL.md',
      '.gemini/skills/api-generator/references/route-checklist.md',
    ],
    [
      'cline',
      '.cline/skills/api-generator/SKILL.md',
      '.cline/skills/api-generator/references/route-checklist.md',
    ],
    [
      'codex-cli',
      '.agents/skills/api-generator/SKILL.md',
      '.agents/skills/api-generator/references/route-checklist.md',
    ],
    [
      'windsurf',
      '.windsurf/skills/api-generator/SKILL.md',
      '.windsurf/skills/api-generator/references/route-checklist.md',
    ],
  ] as const)('%s generates skills with supporting files', async (target, skillPath, refPath) => {
    dir = createCanonicalProject();
    const result = await runCli(`generate --targets ${target}`, dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, skillPath), 'API Generator');
    fileContains(join(dir, refPath), 'response schema');
  });

  it('generates Cursor files with doc-aligned content formats (excluding environment/sandbox)', async () => {
    dir = createCanonicalProject(`version: 1
targets: [cursor]
features: [rules, commands, agents, skills, hooks, mcp, ignore]
`);
    const result = await runCli('generate --targets cursor', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');

    fileContains(join(dir, '.cursor', 'rules', 'general.mdc'), 'alwaysApply: true');
    fileContains(join(dir, '.cursor', 'rules', 'general.mdc'), '# Standards');
    fileContains(join(dir, '.cursor', 'rules', 'typescript.mdc'), 'alwaysApply: false');
    fileContains(join(dir, '.cursor', 'rules', 'typescript.mdc'), 'globs:');
    fileContains(join(dir, '.cursor', 'rules', 'typescript.mdc'), 'src/**/*.ts');

    fileContains(
      join(dir, '.cursor', 'commands', 'review.md'),
      'Review current changes for quality.',
    );
    fileContains(join(dir, '.cursor', 'agents', 'code-reviewer.md'), 'name: code-reviewer');
    fileContains(
      join(dir, '.cursor', 'agents', 'code-reviewer.md'),
      'description: Code review specialist',
    );
    fileContains(join(dir, '.cursor', 'agents', 'code-reviewer.md'), 'tools:');
    fileContains(join(dir, '.cursor', 'agents', 'code-reviewer.md'), 'model: sonnet');

    fileContains(
      join(dir, '.cursor', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
    fileContains(join(dir, '.cursor', 'skills', 'api-generator', 'SKILL.md'), '# API Generator');
    fileContains(
      join(dir, '.cursor', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );

    const hooks = readJson(join(dir, '.cursor', 'hooks.json'));
    expect(hooks).toMatchObject({ version: 1 });
    // Cursor uses camelCase event names and a flat hook array.
    expect(hooks).toHaveProperty('hooks.postToolUse');

    const postToolUse = (hooks.hooks as Record<string, unknown>).postToolUse as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(postToolUse)).toBe(true);
    expect(postToolUse[0]).toHaveProperty('matcher', 'Write|Edit');
    expect(postToolUse[0]).toHaveProperty('command');
    expect(postToolUse[0]).not.toHaveProperty('hooks');

    const mcp = readJson(join(dir, '.cursor', 'mcp.json'));
    expect(mcp).toHaveProperty('mcpServers.context7.command', 'npx');
    expect(mcp).toHaveProperty('mcpServers.context7.args');

    fileContains(join(dir, '.cursorignore'), 'node_modules');
    fileContains(join(dir, '.cursorignore'), '.env');

    fileNotExists(join(dir, '.cursor', 'settings.json'));
    fileNotExists(join(dir, '.cursor', 'environment.json'));
    fileNotExists(join(dir, '.cursor', 'sandbox.json'));
  });

  it('generates Windsurf AGENTS.md as the root instruction artifact', async () => {
    dir = createCanonicalProject();
    const result = await runCli('generate --targets windsurf', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');
  });

  it('generates Windsurf hooks and MCP example artifacts', async () => {
    dir = createCanonicalProject(`version: 1
targets: [windsurf]
features: [rules, hooks, mcp]
`);
    const result = await runCli('generate --targets windsurf', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    const hooks = readJson(join(dir, '.windsurf', 'hooks.json'));
    expect(hooks).toHaveProperty('hooks');
    fileContains(join(dir, '.windsurf', 'hooks.json'), 'post_tool_use');
    fileContains(join(dir, '.windsurf', 'hooks.json'), 'show_output');

    const mcp = readJson(join(dir, '.windsurf', 'mcp_config.example.json'));
    expect(mcp).toHaveProperty('mcpServers');
    fileContains(join(dir, '.windsurf', 'mcp_config.example.json'), 'context7');
  });

  it('generates Windsurf hooks with native schema and skills with required frontmatter', async () => {
    dir = createCanonicalProject(`version: 1
targets: [windsurf]
features: [rules, skills, hooks]
`);
    const result = await runCli('generate --targets windsurf', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    const hooks = readJson(join(dir, '.windsurf', 'hooks.json'));
    expect(hooks).toHaveProperty('hooks');
    const hookMap = hooks.hooks as Record<string, unknown>;
    expect(Object.keys(hookMap).every((key) => key === key.toLowerCase())).toBe(true);
    const postEntries = hookMap.post_tool_use as Array<Record<string, unknown>>;
    expect(Array.isArray(postEntries)).toBe(true);
    expect(postEntries.length).toBeGreaterThan(0);
    expect(postEntries[0]).toMatchObject({ show_output: true });
    expect(typeof postEntries[0]?.command).toBe('string');
    expect(postEntries[0]).not.toHaveProperty('matcher');
    expect(postEntries[0]).not.toHaveProperty('hooks');

    fileContains(
      join(dir, '.windsurf', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.windsurf', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
  });

  it('generates Windsurf files with doc-aligned content formats across all artifact types', async () => {
    dir = createCanonicalProject(`version: 1
targets: [windsurf]
features: [rules, commands, skills, hooks, mcp]
`);
    const result = await runCli('generate --targets windsurf', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    // Root instructions are plain markdown without frontmatter.
    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');
    fileNotContains(join(dir, 'AGENTS.md'), '---');

    // Rules use trigger-based Windsurf frontmatter; Windsurf reads the scope from `globs`.
    fileContains(join(dir, '.windsurf', 'rules', 'typescript.md'), 'trigger: glob');
    fileContains(join(dir, '.windsurf', 'rules', 'typescript.md'), '\nglobs: src/**/*.ts\n');
    fileContains(join(dir, '.windsurf', 'rules', 'typescript.md'), 'description: TypeScript');

    // Workflows include command description as intro + body content.
    fileContains(
      join(dir, '.windsurf', 'workflows', 'review.md'),
      'Review current changes for quality.',
    );
    fileContains(join(dir, '.windsurf', 'workflows', 'review.md'), 'Code review');

    // Skills include required name + description frontmatter.
    fileContains(
      join(dir, '.windsurf', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.windsurf', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );

    // Hooks follow native Windsurf shape.
    const hooks = readJson(join(dir, '.windsurf', 'hooks.json'));
    expect(hooks).toHaveProperty('hooks.post_tool_use');
    const post = ((hooks.hooks as Record<string, unknown>).post_tool_use ?? []) as Array<
      Record<string, unknown>
    >;
    expect(post[0]).toMatchObject({ show_output: true });
    expect(typeof post[0]?.command).toBe('string');
    expect(post[0]).not.toHaveProperty('matcher');
    expect(post[0]).not.toHaveProperty('hooks');

    // MCP output is a project-owned reference artifact with mcpServers snippet.
    const mcp = readJson(join(dir, '.windsurf', 'mcp_config.example.json'));
    expect(mcp).toHaveProperty('mcpServers.context7');
  });

  it('generates Continue rules, prompts, skills, and mcp with expected content contract', async () => {
    dir = createCanonicalProject(`version: 1
targets: [continue]
features: [rules, commands, skills, mcp]
`);
    const result = await runCli('generate --targets continue', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirTreeExactly(join(dir, '.continue'), [
      'mcpServers/',
      'mcpServers/agentsmesh.json',
      'prompts/',
      'prompts/review.md',
      'rules/',
      'rules/general.md',
      'rules/typescript.md',
      'skills/',
      'skills/api-generator/',
      'skills/api-generator/SKILL.md',
      'skills/api-generator/references/',
      'skills/api-generator/references/route-checklist.md',
      'skills/api-generator/template.ts',
    ]);

    fileContains(join(dir, '.continue', 'rules', 'general.md'), '# Standards');
    fileContains(
      join(dir, '.continue', 'rules', 'general.md'),
      'description: Project-wide coding standards',
    );
    fileNotContains(join(dir, '.continue', 'rules', 'general.md'), 'root:');

    fileContains(
      join(dir, '.continue', 'rules', 'typescript.md'),
      'description: TypeScript specific rules',
    );
    fileContains(join(dir, '.continue', 'rules', 'typescript.md'), 'globs:');
    fileContains(join(dir, '.continue', 'rules', 'typescript.md'), 'src/**/*.ts');

    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'x-agentsmesh-kind: command');
    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'x-agentsmesh-name: review');
    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'description: Code review');
    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'x-agentsmesh-allowed-tools:');
    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'Bash(git diff)');
    fileContains(join(dir, '.continue', 'prompts', 'review.md'), 'invokable: true');
    fileNotContains(join(dir, '.continue', 'prompts', 'review.md'), '\nname:');

    fileContains(join(dir, '.continue', 'skills', 'api-generator', 'SKILL.md'), '# API Generator');
    fileContains(
      join(dir, '.continue', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
    fileContains(
      join(dir, '.continue', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );
    fileContains(
      join(dir, '.continue', 'skills', 'api-generator', 'template.ts'),
      'createRouteSchema',
    );

    fileContains(join(dir, '.continue', 'mcpServers', 'agentsmesh.json'), 'context7');
  });

  it('generates Junie primary instruction, commands, agents, project mcp, and .aiignore', async () => {
    dir = createCanonicalProject(`version: 1
targets: [junie]
features: [rules, commands, agents, skills, mcp, ignore]
`);
    const result = await runCli('generate --targets junie', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirTreeExactly(dir, [
      '.agentsmesh/',
      '.agentsmesh/.lock',
      '.agentsmeshcache',
      '.agentsmesh/agents/',
      '.agentsmesh/agents/code-reviewer.md',
      '.agentsmesh/agents/researcher.md',
      '.agentsmesh/commands/',
      '.agentsmesh/commands/review.md',
      '.agentsmesh/hooks.yaml',
      '.agentsmesh/ignore',
      '.agentsmesh/mcp.json',
      '.agentsmesh/permissions.yaml',
      '.agentsmesh/rules/',
      '.agentsmesh/rules/_root.md',
      '.agentsmesh/rules/typescript.md',
      '.agentsmesh/skills/',
      '.agentsmesh/skills/api-generator/',
      '.agentsmesh/skills/api-generator/SKILL.md',
      '.agentsmesh/skills/api-generator/references/',
      '.agentsmesh/skills/api-generator/references/route-checklist.md',
      '.agentsmesh/skills/api-generator/template.ts',
      '.aiignore',
      '.junie/',
      '.junie/AGENTS.md',
      '.junie/agents/',
      '.junie/agents/code-reviewer.md',
      '.junie/agents/researcher.md',
      '.junie/commands/',
      '.junie/commands/review.md',
      '.junie/mcp/',
      '.junie/mcp/mcp.json',
      '.junie/rules/',
      '.junie/rules/typescript.md',
      '.junie/skills/',
      '.junie/skills/api-generator/',
      '.junie/skills/api-generator/SKILL.md',
      '.junie/skills/api-generator/references/',
      '.junie/skills/api-generator/references/route-checklist.md',
      '.junie/skills/api-generator/template.ts',
      'agentsmesh.yaml',
    ]);
    fileContains(join(dir, '.junie', 'AGENTS.md'), '# Standards');
    fileContains(join(dir, '.junie', 'mcp', 'mcp.json'), 'context7');
    fileContains(join(dir, '.junie', 'skills', 'api-generator', 'SKILL.md'), '# API Generator');
    fileContains(
      join(dir, '.junie', 'commands', 'review.md'),
      'Review current changes for quality',
    );
    fileContains(join(dir, '.junie', 'agents', 'code-reviewer.md'), 'You are a code reviewer.');
    fileContains(join(dir, '.aiignore'), '.env');
  });

  it('generates Junie files with doc-aligned native formats', async () => {
    dir = createCanonicalProject(`version: 1
targets: [junie]
features: [rules, commands, agents, skills, mcp, ignore]
`);
    const result = await runCli('generate --targets junie', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    // Native Junie guidance should be plain Markdown content.
    fileContains(join(dir, '.junie', 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, '.junie', 'AGENTS.md'), 'root: true');
    fileNotContains(join(dir, '.junie', 'AGENTS.md'), '\n---\n');

    // Native rules are flat markdown files without canonical metadata frontmatter.
    fileContains(join(dir, '.junie', 'rules', 'typescript.md'), '# TypeScript');
    fileNotContains(join(dir, '.junie', 'rules', 'typescript.md'), 'globs:');
    fileNotContains(join(dir, '.junie', 'rules', 'typescript.md'), 'targets:');

    // MCP follows documented .junie/mcp/mcp.json shape.
    const mcp = readJson(join(dir, '.junie', 'mcp', 'mcp.json'));
    expect(mcp).toHaveProperty('mcpServers');
    expect(mcp).toHaveProperty('mcpServers.context7.command', 'npx');

    // Compatibility mirrors (commands/agents) are emitted as frontmatter-backed markdown.
    fileContains(
      join(dir, '.junie', 'commands', 'review.md'),
      'Review current changes for quality.',
    );
    expect(markdownFrontmatter(join(dir, '.junie', 'commands', 'review.md')).description).toBe(
      'Code review',
    );
    fileContains(join(dir, '.junie', 'agents', 'code-reviewer.md'), 'You are a code reviewer.');
    expect(markdownFrontmatter(join(dir, '.junie', 'agents', 'code-reviewer.md')).name).toBe(
      'code-reviewer',
    );
  });

  it('generates Kiro rules, skills, hooks, mcp, and ignore with doc-aligned formats', async () => {
    dir = createCanonicalProject(`version: 1
targets: [kiro]
features: [rules, skills, mcp, hooks, ignore]
`);
    const result = await runCli('generate --targets kiro', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirTreeExactly(dir, [
      '.agentsmesh/',
      '.agentsmesh/.lock',
      '.agentsmesh/agents/',
      '.agentsmesh/agents/code-reviewer.md',
      '.agentsmesh/agents/researcher.md',
      '.agentsmesh/commands/',
      '.agentsmesh/commands/review.md',
      '.agentsmesh/hooks.yaml',
      '.agentsmesh/ignore',
      '.agentsmesh/mcp.json',
      '.agentsmesh/permissions.yaml',
      '.agentsmesh/rules/',
      '.agentsmesh/rules/_root.md',
      '.agentsmesh/rules/typescript.md',
      '.agentsmesh/skills/',
      '.agentsmesh/skills/api-generator/',
      '.agentsmesh/skills/api-generator/SKILL.md',
      '.agentsmesh/skills/api-generator/references/',
      '.agentsmesh/skills/api-generator/references/route-checklist.md',
      '.agentsmesh/skills/api-generator/template.ts',
      '.agentsmeshcache',
      '.kiro/',
      '.kiro/hooks/',
      '.kiro/hooks/post-tool-use-1.json',
      '.kiro/settings/',
      '.kiro/settings/mcp.json',
      '.kiro/skills/',
      '.kiro/skills/api-generator/',
      '.kiro/skills/api-generator/SKILL.md',
      '.kiro/skills/api-generator/references/',
      '.kiro/skills/api-generator/references/route-checklist.md',
      '.kiro/skills/api-generator/template.ts',
      '.kiro/steering/',
      '.kiro/steering/typescript.md',
      '.kiroignore',
      'AGENTS.md',
      'agentsmesh.yaml',
    ]);

    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');
    fileContains(join(dir, '.kiro', 'steering', 'typescript.md'), 'inclusion: fileMatch');
    fileContains(join(dir, '.kiro', 'steering', 'typescript.md'), 'fileMatchPattern: src/**/*.ts');
    fileContains(join(dir, '.kiro', 'skills', 'api-generator', 'SKILL.md'), 'name: api-generator');
    fileContains(join(dir, '.kiro', 'hooks', 'post-tool-use-1.json'), '"trigger": "PostToolUse"');
    fileContains(join(dir, '.kiro', 'hooks', 'post-tool-use-1.json'), 'prettier --write');
    const mcp = readJson(join(dir, '.kiro', 'settings', 'mcp.json'));
    expect(mcp).toHaveProperty('mcpServers');
    expect(mcp).toHaveProperty('mcpServers.context7.command', 'npx');
    fileContains(join(dir, '.kiroignore'), '.env');
    fileNotExists(join(dir, '.kiro', 'commands'));
    fileNotExists(join(dir, '.kiro', 'agents'));
  });

  it('generates Roo Code rules, commands, skills, mcp, and ignore with doc-aligned formats', async () => {
    dir = createCanonicalProject(`version: 1
targets: [roo-code]
features: [rules, commands, skills, mcp, ignore]
`);
    const result = await runCli('generate --targets roo-code', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    // Root rule emitted as .roo/rules/00-root.md — plain markdown, no frontmatter.
    fileContains(join(dir, '.roo', 'rules', '00-root.md'), '# Standards');
    fileNotContains(join(dir, '.roo', 'rules', '00-root.md'), 'root: true');
    fileNotContains(join(dir, '.roo', 'rules', '00-root.md'), '\n---\n');

    // Non-root rules are plain markdown without canonical frontmatter.
    fileContains(join(dir, '.roo', 'rules', 'typescript.md'), '# TypeScript');
    fileNotContains(join(dir, '.roo', 'rules', 'typescript.md'), 'globs:');
    fileNotContains(join(dir, '.roo', 'rules', 'typescript.md'), 'targets:');

    // Commands include description frontmatter.
    fileContains(join(dir, '.roo', 'commands', 'review.md'), 'description: Code review');
    fileContains(join(dir, '.roo', 'commands', 'review.md'), 'Review current changes for quality.');

    // Skills use native SKILL.md format with required frontmatter.
    fileContains(join(dir, '.roo', 'skills', 'api-generator', 'SKILL.md'), 'name: api-generator');
    fileContains(
      join(dir, '.roo', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );

    // MCP follows .roo/mcp.json shape.
    const mcp = readJson(join(dir, '.roo', 'mcp.json'));
    expect(mcp).toHaveProperty('mcpServers');
    expect(mcp).toHaveProperty('mcpServers.context7.command', 'npx');

    // Ignore file is emitted as .rooignore.
    fileContains(join(dir, '.rooignore'), '.env');
  });

  it('generates Kilo Code rules, commands, agents, skills, mcp, and ignore with new-layout paths', async () => {
    dir = createCanonicalProject(`version: 1
targets: [kilo-code]
features: [rules, commands, agents, skills, mcp, ignore]
`);
    const result = await runCli('generate --targets kilo-code', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    // Root rule emitted as AGENTS.md (kilo's documented portable root).
    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');

    // Non-root rules go to .kilo/rules/<slug>.md with frontmatter when description/globs present.
    fileContains(join(dir, '.kilo', 'rules', 'typescript.md'), '# TypeScript');

    // Commands include description frontmatter only (no allowed-tools projection).
    fileContains(join(dir, '.kilo', 'commands', 'review.md'), 'description: Code review');
    fileContains(
      join(dir, '.kilo', 'commands', 'review.md'),
      'Review current changes for quality.',
    );
    fileNotContains(join(dir, '.kilo', 'commands', 'review.md'), 'allowed-tools');
    fileNotContains(join(dir, '.kilo', 'commands', 'review.md'), 'allowedTools');

    // Native first-class agents at .kilo/agents/<slug>.md with mode: subagent frontmatter.
    fileContains(join(dir, '.kilo', 'agents', 'code-reviewer.md'), 'mode: subagent');
    fileContains(
      join(dir, '.kilo', 'agents', 'code-reviewer.md'),
      'description: Code review specialist',
    );
    fileContains(join(dir, '.kilo', 'agents', 'researcher.md'), 'mode: subagent');

    // Skills use SKILL.md with frontmatter and supporting files.
    fileContains(join(dir, '.kilo', 'skills', 'api-generator', 'SKILL.md'), 'name: api-generator');
    fileContains(
      join(dir, '.kilo', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
    fileExists(join(dir, '.kilo', 'skills', 'api-generator', 'references', 'route-checklist.md'));

    // MCP at .kilo/mcp.json with mcpServers wrapper.
    const mcp = readJson(join(dir, '.kilo', 'mcp.json'));
    expect(mcp).toHaveProperty('mcpServers');
    expect(mcp).toHaveProperty('mcpServers.context7.command', 'npx');

    // Ignore uses .kilocodeignore (legacy filename, only natively-loaded ignore in kilo).
    fileContains(join(dir, '.kilocodeignore'), '.env');
    fileNotExists(join(dir, '.kiloignore'));

    // Hooks and permissions are NOT projected (capabilities: 'none').
    fileNotExists(join(dir, '.kilo', 'hooks'));
    fileNotExists(join(dir, 'kilo.jsonc'));
  });

  it('generates Antigravity rules, workflows, and skills with doc-aligned formats', async () => {
    dir = createCanonicalProject(`version: 1
targets: [antigravity]
features: [rules, commands, skills]
`);
    const result = await runCli('generate --targets antigravity', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    // Root rule is emitted as plain markdown without frontmatter.
    fileContains(join(dir, '.agents', 'rules', 'general.md'), '# Standards');
    fileNotContains(join(dir, '.agents', 'rules', 'general.md'), 'root: true');
    fileNotContains(join(dir, '.agents', 'rules', 'general.md'), '---');

    // Non-root rules are plain markdown without canonical frontmatter.
    fileContains(join(dir, '.agents', 'rules', 'typescript.md'), '# TypeScript');
    fileNotContains(join(dir, '.agents', 'rules', 'typescript.md'), 'globs:');

    // Commands map to .agents/workflows/ as plain markdown.
    fileContains(join(dir, '.agents', 'workflows', 'review.md'), 'Review current changes');
    fileNotContains(join(dir, '.agents', 'workflows', 'review.md'), 'allowed-tools:');
    fileNotContains(join(dir, '.agents', 'workflows', 'review.md'), 'x-agentsmesh');

    // Skills use native Antigravity SKILL.md format with required frontmatter.
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'SKILL.md'),
      'description: Generate API endpoints',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );
  });

  it('generates Amp AGENTS.md, skills, and .amp/settings.json', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp]
features: [rules, skills, mcp]
`);
    const result = await runCli('generate --targets amp', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );
    fileContains(join(dir, '.amp', 'settings.json'), 'amp.mcpServers');
    fileContains(join(dir, '.amp', 'settings.json'), 'context7');
  });

  it('generates Zed .rules and .zed/settings.json', async () => {
    dir = createCanonicalProject(`version: 1
targets: [zed]
features: [rules, mcp]
`);
    const result = await runCli('generate --targets zed', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, '.rules'), '# Standards');
    fileNotContains(join(dir, '.rules'), 'root: true');
    fileContains(join(dir, '.zed', 'settings.json'), 'context_servers');
    fileContains(join(dir, '.zed', 'settings.json'), 'context7');
  });

  it('generates Warp AGENTS.md, skills, and .warp/.mcp.json', async () => {
    dir = createCanonicalProject(`version: 1
targets: [warp]
features: [rules, skills, mcp]
`);
    const result = await runCli('generate --targets warp', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    fileContains(join(dir, 'AGENTS.md'), '# Standards');
    fileNotContains(join(dir, 'AGENTS.md'), 'root: true');
    fileContains(join(dir, '.warp', 'skills', 'api-generator', 'SKILL.md'), 'name: api-generator');
    fileContains(
      join(dir, '.warp', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );
    fileContains(join(dir, '.warp', '.mcp.json'), 'mcpServers');
    fileContains(join(dir, '.warp', '.mcp.json'), 'context7');
  });

  it('generates Goose .goosehints, skills, and .gooseignore', async () => {
    dir = createCanonicalProject(`version: 1
targets: [goose]
features: [rules, skills, ignore]
`);
    const result = await runCli('generate --targets goose', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirTreeExactly(dir, [
      '.agents/',
      '.agents/skills/',
      '.agents/skills/api-generator/',
      '.agents/skills/api-generator/SKILL.md',
      '.agents/skills/api-generator/references/',
      '.agents/skills/api-generator/references/route-checklist.md',
      '.agents/skills/api-generator/template.ts',
      '.agentsmesh/',
      '.agentsmesh/.lock',
      '.agentsmesh/agents/',
      '.agentsmesh/agents/code-reviewer.md',
      '.agentsmesh/agents/researcher.md',
      '.agentsmesh/commands/',
      '.agentsmesh/commands/review.md',
      '.agentsmesh/hooks.yaml',
      '.agentsmesh/ignore',
      '.agentsmesh/mcp.json',
      '.agentsmesh/permissions.yaml',
      '.agentsmesh/rules/',
      '.agentsmesh/rules/_root.md',
      '.agentsmesh/rules/typescript.md',
      '.agentsmesh/skills/',
      '.agentsmesh/skills/api-generator/',
      '.agentsmesh/skills/api-generator/SKILL.md',
      '.agentsmesh/skills/api-generator/references/',
      '.agentsmesh/skills/api-generator/references/route-checklist.md',
      '.agentsmesh/skills/api-generator/template.ts',
      '.agentsmeshcache',
      '.goosehints',
      '.gooseignore',
      'agentsmesh.yaml',
    ]);

    fileContains(join(dir, '.goosehints'), '# Standards');
    fileNotContains(join(dir, '.goosehints'), 'root: true');
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'SKILL.md'),
      'name: api-generator',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'api-generator', 'references', 'route-checklist.md'),
      'response schema',
    );
    fileContains(join(dir, '.gooseignore'), '.env');
  });

  it('generates Aider CONVENTIONS.md, skills, and .aiderignore', async () => {
    dir = createCanonicalProject(`version: 1
targets: [aider]
features: [rules, skills, ignore]
`);
    const result = await runCli('generate --targets aider', dir);
    expect(result.exitCode, result.stderr).toBe(0);

    dirTreeExactly(dir, [
      '.agentsmesh/',
      '.agentsmesh/.lock',
      '.agentsmesh/agents/',
      '.agentsmesh/agents/code-reviewer.md',
      '.agentsmesh/agents/researcher.md',
      '.agentsmesh/commands/',
      '.agentsmesh/commands/review.md',
      '.agentsmesh/hooks.yaml',
      '.agentsmesh/ignore',
      '.agentsmesh/mcp.json',
      '.agentsmesh/permissions.yaml',
      '.agentsmesh/rules/',
      '.agentsmesh/rules/_root.md',
      '.agentsmesh/rules/typescript.md',
      '.agentsmesh/skills/',
      '.agentsmesh/skills/api-generator/',
      '.agentsmesh/skills/api-generator/SKILL.md',
      '.agentsmesh/skills/api-generator/references/',
      '.agentsmesh/skills/api-generator/references/route-checklist.md',
      '.agentsmesh/skills/api-generator/template.ts',
      '.agentsmeshcache',
      '.aider.conf.yml',
      '.aider/',
      '.aider/skills/',
      '.aider/skills/api-generator/',
      '.aider/skills/api-generator/SKILL.md',
      '.aider/skills/api-generator/references/',
      '.aider/skills/api-generator/references/route-checklist.md',
      '.aider/skills/api-generator/template.ts',
      '.aiderignore',
      'CONVENTIONS.md',
      'agentsmesh.yaml',
    ]);

    fileContains(join(dir, 'CONVENTIONS.md'), '# Standards');
    fileNotContains(join(dir, 'CONVENTIONS.md'), 'root: true');
    fileContains(join(dir, '.aider', 'skills', 'api-generator', 'SKILL.md'), 'name: api-generator');
    fileContains(join(dir, '.aiderignore'), '.env');
  });
});
