import { describe, it, expect } from 'vitest';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generatePermissions,
  generateHooks,
  generateIgnore,
} from '../../../../src/targets/claude-code/generator.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

describe('generateRules (claude-code)', () => {
  it('generates root CLAUDE.md from root rule body', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: 'Project rules',
          globs: [],
          body: '# Rules\n- Use TypeScript\n',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('CLAUDE.md');
    expect(results[0]!.content).toContain('# Rules');
    expect(results[0]!.content).toContain('- Use TypeScript');
    expect(results[0]!.content).not.toContain('## AgentsMesh Generation Contract');
  });

  it('non-root rule with description includes it in frontmatter', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/style.md',
          root: false,
          targets: [],
          description: 'Style rules',
          globs: [],
          body: 'Style body.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results[0]!.content).toContain('description: Style rules');
    expect(results[0]!.content).not.toContain('globs:');
  });

  it('non-root rule with both description and globs includes both in frontmatter', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/ts.md',
          root: false,
          targets: [],
          description: 'TypeScript rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results[0]!.content).toContain('description: TypeScript rules');
    expect(results[0]!.content).toContain('src/**/*.ts');
  });

  it('returns no CLAUDE.md but does generate .claude/rules/*.md for non-root rules', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: '',
          globs: ['src/**/*.ts'],
          body: 'Use TypeScript.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/rules/typescript.md');
  });

  it('generates root CLAUDE.md + .claude/rules/*.md when both root and non-root rules exist', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: '# Root',
        },
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(['CLAUDE.md', '.claude/rules/typescript.md'].sort());
    const tsRule = results.find((r) => r.path === '.claude/rules/typescript.md')!;
    expect(tsRule.content).toContain('description: TS rules');
    expect(tsRule.content).toContain('Use strict mode.');
  });

  it('skips non-root rules targeting other tools', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root',
        },
        {
          source: '/proj/.agentsmesh/rules/cursor-only.md',
          root: false,
          targets: ['cursor'],
          description: 'cursor only',
          globs: [],
          body: 'Cursor body.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('CLAUDE.md');
  });

  it('uses first root rule when multiple roots (edge case)', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/a.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'First',
        },
        {
          source: '/b.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Second',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('First');
  });
});

describe('generateCommands (claude-code)', () => {
  it('generates .claude/commands/*.md from canonical commands', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/review.md',
          name: 'review',
          description: 'Run code review',
          allowedTools: ['Read', 'Grep', 'Bash(git diff)'],
          body: 'Review current changes.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/commands/review.md');
    expect(results[0]!.content).toContain('description:');
    expect(results[0]!.content).toContain('Run code review');
    expect(results[0]!.content).toContain('allowed-tools');
    expect(results[0]!.content).toContain('Review current changes.');
  });

  it('returns empty when no commands', () => {
    const canonical = makeCanonical({ commands: [] });
    expect(generateCommands(canonical)).toEqual([]);
  });

  it('generates multiple command files', () => {
    const canonical = makeCanonical({
      commands: [
        { source: '/a', name: 'review', description: 'Review', allowedTools: [], body: 'Body1' },
        { source: '/b', name: 'deploy', description: 'Deploy', allowedTools: [], body: 'Body2' },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(['.claude/commands/deploy.md', '.claude/commands/review.md']);
  });
});

describe('generateAgents (claude-code)', () => {
  it('generates .claude/agents/*.md from canonical agents', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/code-reviewer.md',
          name: 'code-reviewer',
          description: 'Reviews code for quality',
          tools: ['Read', 'Grep', 'Glob'],
          disallowedTools: [],
          model: 'sonnet',
          permissionMode: 'default',
          maxTurns: 10,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'You are an expert code reviewer.',
        },
      ],
    });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/agents/code-reviewer.md');
    expect(results[0]!.content).toContain('name: code-reviewer');
    expect(results[0]!.content).toContain('description:');
    expect(results[0]!.content).toContain('You are an expert code reviewer.');
  });

  it('returns empty when no agents', () => {
    const canonical = makeCanonical({ agents: [] });
    expect(generateAgents(canonical)).toEqual([]);
  });

  it('generates multiple agent files with full frontmatter', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/a',
          name: 'reviewer',
          description: 'Review',
          tools: ['Read'],
          disallowedTools: ['Bash'],
          model: 'sonnet',
          permissionMode: 'default',
          maxTurns: 5,
          mcpServers: ['context7'],
          hooks: { PostToolUse: [{ matcher: 'Write', command: 'fmt', type: 'command' }] },
          skills: ['lint'],
          memory: '.memory/reviewer.md',
          body: 'Body1',
        },
        {
          source: '/b',
          name: 'deploy',
          description: 'Deploy',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Body2',
        },
      ],
    });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(['.claude/agents/deploy.md', '.claude/agents/reviewer.md']);
  });
});

describe('generateSkills (claude-code)', () => {
  it('generates .claude/skills/{name}/SKILL.md from canonical skills', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/api-gen/SKILL.md',
          name: 'api-gen',
          description: 'Generate REST API endpoints',
          body: '# API Generator\nWhen asked to create an API, check patterns.',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/skills/api-gen/SKILL.md');
    expect(results[0]!.content).toContain('description:');
    expect(results[0]!.content).toContain('Generate REST API endpoints');
    expect(results[0]!.content).toContain('API Generator');
  });

  it('returns empty when no skills', () => {
    const canonical = makeCanonical({ skills: [] });
    expect(generateSkills(canonical)).toEqual([]);
  });

  it('generates skill with empty body (covers skill.body.trim() || "" branch)', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/empty/SKILL.md',
          name: 'empty',
          description: '',
          body: '',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('name: empty');
    expect(results[0]!.content.replace(/^---[\s\S]*?---\s*/m, '').trim()).toBe('');
  });

  it('generates supporting files alongside SKILL.md', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/my-skill/SKILL.md',
          name: 'my-skill',
          description: 'My skill',
          body: 'Body.',
          supportingFiles: [
            {
              relativePath: 'template.ts',
              absolutePath: '/proj/.agentsmesh/skills/my-skill/template.ts',
              content: 'export const x = 1;',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(2);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.claude/skills/my-skill/SKILL.md',
      '.claude/skills/my-skill/template.ts',
    ]);
    const template = results.find((r) => r.path.endsWith('template.ts'));
    expect(template?.content).toBe('export const x = 1;');
  });
});

describe('generateMcp (claude-code)', () => {
  it('generates .mcp.json from canonical mcp config', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.mcp.json');
    const parsed = JSON.parse(results[0]!.content) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers.context7).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
    });
  });

  it('returns empty when mcp is null', () => {
    const canonical = makeCanonical({ mcp: null });
    expect(generateMcp(canonical)).toEqual([]);
  });

  it('emits an empty server map when mcpServers is explicitly empty', () => {
    const canonical = makeCanonical({ mcp: { mcpServers: {} } });
    expect(generateMcp(canonical)).toEqual([
      { path: '.mcp.json', content: JSON.stringify({ mcpServers: {} }, null, 2) },
    ]);
  });

  it('generates multiple servers with full config', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
          github: {
            description: 'GitHub MCP',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '$GITHUB_TOKEN' },
          },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
    expect(parsed.mcpServers.github).toMatchObject({
      description: 'GitHub MCP',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '$GITHUB_TOKEN' },
    });
  });
});

describe('generatePermissions (claude-code)', () => {
  it('generates .claude/settings.json from canonical permissions', () => {
    const canonical = makeCanonical({
      permissions: {
        allow: ['Read', 'Grep', 'LS'],
        deny: ['WebFetch', 'Bash(curl:*)'],
      },
    });
    const results = generatePermissions(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/settings.json');
    const parsed = JSON.parse(results[0]!.content) as {
      permissions: { allow: string[]; deny: string[] };
    };
    expect(parsed.permissions.allow).toEqual(['Read', 'Grep', 'LS']);
    expect(parsed.permissions.deny).toEqual(['WebFetch', 'Bash(curl:*)']);
  });

  it('returns empty when permissions is null', () => {
    expect(generatePermissions(makeCanonical({ permissions: null }))).toEqual([]);
  });

  it('emits empty permissions when all permission lists are empty', () => {
    expect(generatePermissions(makeCanonical({ permissions: { allow: [], deny: [] } }))).toEqual([
      {
        path: '.claude/settings.json',
        content: JSON.stringify({ permissions: { allow: [], deny: [], ask: [] } }, null, 2),
      },
    ]);
  });

  it('generates with allow-only', () => {
    const canonical = makeCanonical({
      permissions: { allow: ['Read'], deny: [] },
    });
    const results = generatePermissions(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as {
      permissions: { allow: string[]; deny: string[] };
    };
    expect(parsed.permissions.allow).toEqual(['Read']);
    expect(parsed.permissions.deny).toEqual([]);
  });

  it('generates with deny-only', () => {
    const canonical = makeCanonical({
      permissions: { allow: [], deny: ['Bash(rm *)'] },
    });
    const results = generatePermissions(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as {
      permissions: { allow: string[]; deny: string[] };
    };
    expect(parsed.permissions.allow).toEqual([]);
    expect(parsed.permissions.deny).toEqual(['Bash(rm *)']);
  });
});

describe('generateHooks (claude-code)', () => {
  it('generates .claude/settings.json with hooks from canonical hooks.yaml', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', command: './scripts/validate.sh $TOOL_INPUT', timeout: 30 },
        ],
        PostToolUse: [{ matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claude/settings.json');
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown> };
    expect(parsed.hooks).toBeDefined();
    const preToolUse = parsed.hooks.PreToolUse as Array<{ matcher: string; hooks: unknown[] }>;
    expect(preToolUse).toHaveLength(1);
    expect(preToolUse[0]!.matcher).toBe('Bash');
    expect(preToolUse[0]!.hooks).toHaveLength(1);
    expect(
      preToolUse[0]!.hooks[0] as { type: string; command: string; timeout: number },
    ).toMatchObject({
      type: 'command',
      command: './scripts/validate.sh $TOOL_INPUT',
      timeout: 30,
    });
  });

  it('emits an empty hook map when no hook entries can be translated', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: '', type: 'command' as const }],
      },
    });
    expect(generateHooks(canonical)).toEqual([
      { path: '.claude/settings.json', content: JSON.stringify({ hooks: {} }, null, 2) },
    ]);
  });

  it('skips non-array hook values (non-array entries)', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier', type: 'command' as const }],
        PreToolUse: 'invalid' as unknown as import('../../../../src/core/types.js').HookEntry[],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown> };
    expect(parsed.hooks.PostToolUse).toBeDefined();
    expect(parsed.hooks.PreToolUse).toBeUndefined();
  });

  it('returns empty when hooks is null', () => {
    expect(generateHooks(makeCanonical({ hooks: null }))).toEqual([]);
  });

  it.each([{}, { PreToolUse: [] }])(
    'emits an empty hook map for explicitly empty hooks %j',
    (hooks) => {
      expect(generateHooks(makeCanonical({ hooks }))).toEqual([
        { path: '.claude/settings.json', content: JSON.stringify({ hooks: {} }, null, 2) },
      ]);
    },
  );

  it('generates multiple event types', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: 'validate.sh' }],
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
        Notification: [{ matcher: '*', command: 'notify.sh' }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown[]> };
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.Notification).toHaveLength(1);
  });

  it('omits timeout when not specified', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    });
    const results = generateHooks(canonical);
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown[]> };
    const hook = (parsed.hooks.PostToolUse as Array<{ hooks: Array<Record<string, unknown>> }>)[0]!
      .hooks[0] as Record<string, unknown>;
    expect(hook.timeout).toBeUndefined();
  });

  it('generates prompt-type hooks using prompt field (lines 159-160 branch)', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [
          { matcher: 'Write', command: '', type: 'prompt' as const, prompt: 'Review this file' },
        ],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown[]> };
    const hookEntry = (
      parsed.hooks.PostToolUse as Array<{ hooks: Array<Record<string, unknown>> }>
    )[0]!.hooks[0] as Record<string, unknown>;
    expect(hookEntry.type).toBe('prompt');
    expect(hookEntry.prompt).toBe('Review this file');
  });
});

describe('generateIgnore (claude-code)', () => {
  it('generates .claudeignore from canonical ignore patterns', () => {
    const canonical = makeCanonical({
      ignore: ['node_modules', '.env', 'dist', 'secrets/'],
    });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.claudeignore');
    expect(results[0]!.content).toBe('node_modules\n.env\ndist\nsecrets/');
  });

  it('returns empty when ignore is empty', () => {
    expect(generateIgnore(makeCanonical({ ignore: [] }))).toEqual([]);
  });

  it('generates single pattern', () => {
    const canonical = makeCanonical({ ignore: ['dist'] });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('dist');
  });
});
