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
} from '../../../../src/targets/cursor/generator.js';
import { cursorHooksToCanonical } from '../../../../src/targets/cursor/hook-format.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { serializeFrontmatter } from '../../../../src/utils/text/markdown.js';

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

describe('generateRules (cursor)', () => {
  it('generates AGENTS.md and .cursor/rules/general.mdc from root rule', () => {
    const canonical: CanonicalFiles = {
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
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const results = generateRules(canonical);
    expect(results).toHaveLength(3);
    const agentsMd = results.find((r) => r.path === 'AGENTS.md');
    const generalMdc = results.find((r) => r.path === '.cursor/rules/general.mdc');
    const dotAgents = results.find((r) => r.path === '.cursor/AGENTS.md');
    expect(agentsMd).toBeDefined();
    expect(agentsMd!.content).toContain('# Rules');
    expect(agentsMd!.content).toContain('Use TypeScript');
    expect(agentsMd!.content).not.toContain('alwaysApply');
    expect(generalMdc).toBeDefined();
    expect(generalMdc!.content).toContain('alwaysApply: true');
    expect(generalMdc!.content).toContain('# Rules');
    expect(generalMdc!.content).toContain('Use TypeScript');
    expect(generalMdc!.content).not.toContain('## AgentsMesh Generation Contract');
    expect(dotAgents).toBeDefined();
    expect(dotAgents!.content).toContain('# Rules');
  });

  it('non-root rule with description and globs includes both in frontmatter', () => {
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
    expect(results[0]!.content).toContain('alwaysApply: false');
  });

  it('non-root rule with description but no globs omits globs from frontmatter', () => {
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

  it('non-root rule targeted at cursor is included', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/cursor-only.md',
          root: false,
          targets: ['cursor'],
          description: 'Cursor-specific',
          globs: [],
          body: 'Cursor body.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.path).sort()).toEqual(
      ['.cursor/AGENTS.md', '.cursor/rules/cursor-only.mdc'].sort(),
    );
  });

  it('non-root rule with no description and no globs has only alwaysApply in frontmatter', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/bare.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Bare rule.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results[0]!.content).toContain('alwaysApply: false');
    expect(results[0]!.content).not.toContain('description:');
    expect(results[0]!.content).not.toContain('globs:');
    expect(results[0]!.content).toContain('Bare rule.');
  });

  it('non-root rule targeted at other tool is filtered out', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/claude-only.md',
          root: false,
          targets: ['claude-code'],
          description: '',
          globs: [],
          body: 'Claude body.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(0);
  });

  it('returns no AGENTS.md/general.mdc but does generate .cursor/rules/{slug}.mdc and aggregate .cursor/AGENTS.md for non-root rules', () => {
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: '',
          globs: ['*.ts'],
          body: 'TypeScript rules',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    const slug = results.find((r) => r.path === '.cursor/rules/typescript.mdc');
    const agg = results.find((r) => r.path === '.cursor/AGENTS.md');
    expect(slug).toBeDefined();
    expect(slug!.content).toContain('alwaysApply: false');
    expect(agg!.content).toContain('TypeScript rules');
    expect(agg!.content).toContain('<!-- agentsmesh:embedded-rules:start -->');
    expect(agg!.content).toContain(
      '<!-- agentsmesh:embedded-rule:start {"source":"rules/typescript.md"',
    );
    expect(agg!.content).not.toContain('Applies to:');
    expect(agg!.content).not.toContain('\n---\n');
  });

  it('handles empty root body', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '',
        },
      ],
    });
    const results = generateRules(canonical);
    const generalMdc = results.find((r) => r.path === '.cursor/rules/general.mdc');
    expect(generalMdc!.content).toContain('alwaysApply: true');
  });

  it('handles root rule with empty body — emits both AGENTS.md and general.mdc', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.path === 'AGENTS.md')).toBeDefined();
    expect(results.find((r) => r.path === '.cursor/rules/general.mdc')).toBeDefined();
  });

  it('generates non-root rule with empty body (covers rule.body.trim() || "" branch)', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/empty-body.md',
          root: false,
          targets: [],
          description: 'No body rule',
          globs: [],
          body: '',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    const slug = results.find((r) => r.path === '.cursor/rules/empty-body.mdc');
    expect(slug!.content).toContain('description: No body rule');
    expect(results.find((r) => r.path === '.cursor/AGENTS.md')).toBeDefined();
  });

  it('maps trigger: always_on to alwaysApply: true for non-root rule', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/always.md',
          root: false,
          targets: [],
          description: 'Always applied',
          globs: [],
          body: 'Always body.',
          trigger: 'always_on' as const,
        },
      ],
    });
    const results = generateRules(canonical);
    const rule = results.find((r) => r.path === '.cursor/rules/always.mdc');
    expect(rule).toBeDefined();
    expect(rule?.content).toContain('alwaysApply: true');
  });

  it('maps trigger: model_decision to alwaysApply: false', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/ai.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'AI body.',
          trigger: 'model_decision' as const,
        },
      ],
    });
    const results = generateRules(canonical);
    const rule = results.find((r) => r.path === '.cursor/rules/ai.mdc');
    expect(rule?.content).toContain('alwaysApply: false');
  });

  it('uses serializeFrontmatter for general.mdc MDC format', () => {
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Body text',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const results = generateRules(canonical);
    const generalMdc = results.find((r) => r.path === '.cursor/rules/general.mdc');
    const expected = serializeFrontmatter({ alwaysApply: true }, 'Body text');
    expect(generalMdc!.content).toBe(expected);
  });
});

describe('generateCommands (cursor)', () => {
  it('generates .cursor/commands/*.md with a description frontmatter block', () => {
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
    expect(results[0]!.path).toBe('.cursor/commands/review.md');
    expect(results[0]!.content).toBe(
      '---\ndescription: Run code review\n---\n\nReview current changes.',
    );
  });

  it('returns empty when no commands', () => {
    const canonical = makeCanonical({ commands: [] });
    expect(generateCommands(canonical)).toEqual([]);
  });

  it('emits a bare body when the command has no description', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/minimal.md',
          name: 'minimal',
          description: '',
          allowedTools: ['Read'],
          body: 'Body',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results[0]!.content).toBe('Body');
  });

  it('generates command with empty body (covers cmd.body.trim() || "" branch)', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/empty.md',
          name: 'empty',
          description: 'Empty body command',
          allowedTools: [],
          body: '',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('---\ndescription: Empty body command\n---\n\n');
  });
});

describe('generateAgents (cursor)', () => {
  it('generates .cursor/agents/*.md from canonical agents', () => {
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
    expect(results[0]!.path).toBe('.cursor/agents/code-reviewer.md');
    expect(results[0]!.content).toContain('name: code-reviewer');
    expect(results[0]!.content).toContain('You are an expert code reviewer.');
  });

  it('returns empty when no agents', () => {
    expect(generateAgents(makeCanonical({ agents: [] }))).toEqual([]);
  });

  it('generates agent with all optional fields present (covers lines 102-115 true branches)', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/full.md',
          name: 'full',
          description: 'Full agent',
          tools: ['Read', 'Write'],
          disallowedTools: ['Bash'],
          model: 'claude-opus',
          permissionMode: 'strict',
          maxTurns: 5,
          mcpServers: ['fs'],
          hooks: { PostToolUse: [{ matcher: 'Write', type: 'command' as const, command: 'lint' }] },
          skills: ['review'],
          memory: 'Remember to check types',
          body: 'You are a full agent.',
        },
      ],
    });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('tools:');
    expect(results[0]!.content).toContain('disallowedTools:');
    expect(results[0]!.content).toContain('model: claude-opus');
    expect(results[0]!.content).toContain('permissionMode: strict');
    expect(results[0]!.content).toContain('maxTurns: 5');
    expect(results[0]!.content).toContain('mcpServers:');
    expect(results[0]!.content).toContain('skills:');
    expect(results[0]!.content).toContain('memory: Remember to check types');
  });

  it('generates agent with empty body (covers agent.body.trim() || "" branch)', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/empty.md',
          name: 'empty',
          description: 'No body',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: '',
        },
      ],
    });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('name: empty');
  });
});

describe('generateSkills (cursor)', () => {
  it('generates .cursor/skills/{name}/SKILL.md from canonical skills', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/api-gen/SKILL.md',
          name: 'api-gen',
          description: 'Generate REST API endpoints',
          body: '# API Gen\nWhen asked to create an API...',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.cursor/skills/api-gen/SKILL.md');
    expect(results[0]!.content).toContain('description:');
    expect(results[0]!.content).toContain('Generate REST API endpoints');
    expect(results[0]!.content).toContain('# API Gen');
  });

  it('returns empty when no skills', () => {
    expect(generateSkills(makeCanonical({ skills: [] }))).toEqual([]);
  });

  it('omits description when empty', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/a',
          name: 'minimal',
          description: '',
          body: 'Body only.',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results[0]!.content).not.toContain('description:');
    expect(results[0]!.content).toContain('Body only.');
  });

  it('generates supporting files inside the skill folder', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/typescript-pro/SKILL.md',
          name: 'typescript-pro',
          description: 'TypeScript best practices',
          body: 'Main skill body.',
          supportingFiles: [
            {
              relativePath: 'references/advanced-types.md',
              absolutePath: '/proj/.agentsmesh/skills/typescript-pro/references/advanced-types.md',
              content: '# Advanced Types',
            },
            {
              relativePath: 'references/patterns.md',
              absolutePath: '/proj/.agentsmesh/skills/typescript-pro/references/patterns.md',
              content: '# Patterns',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(3);
    expect(results[0]!.path).toBe('.cursor/skills/typescript-pro/SKILL.md');
    expect(results[1]!.path).toBe('.cursor/skills/typescript-pro/references/advanced-types.md');
    expect(results[1]!.content).toBe('# Advanced Types');
    expect(results[2]!.path).toBe('.cursor/skills/typescript-pro/references/patterns.md');
  });
});

describe('generateMcp (cursor)', () => {
  it('generates .cursor/mcp.json from canonical mcp config', () => {
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
    expect(results[0]!.path).toBe('.cursor/mcp.json');
    const parsed = JSON.parse(results[0]!.content) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers.context7).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
    });
  });

  it('returns empty when mcp is null', () => {
    expect(generateMcp(makeCanonical({ mcp: null }))).toEqual([]);
  });

  it('returns empty when mcpServers is empty', () => {
    expect(generateMcp(makeCanonical({ mcp: { mcpServers: {} } }))).toEqual([]);
  });
});

describe('generatePermissions (cursor)', () => {
  it('generates .cursor/cli.json with permissions allow and deny', () => {
    const canonical = makeCanonical({
      permissions: {
        allow: ['Read', 'Grep'],
        deny: ['WebFetch'],
      },
    });
    const results = generatePermissions(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.cursor/cli.json');
    const parsed = JSON.parse(results[0]!.content) as {
      permissions: { allow?: string[]; deny?: string[] };
    };
    expect(parsed.permissions.allow).toEqual(['Read', 'Grep']);
    expect(parsed.permissions.deny).toEqual(['WebFetch']);
  });

  it('returns empty when permissions is null', () => {
    expect(generatePermissions(makeCanonical({ permissions: null }))).toEqual([]);
  });

  it('writes managed empty lists, so generate clears them in cli.json', () => {
    expect(generatePermissions(makeCanonical({ permissions: { allow: [], deny: [] } }))).toEqual([
      {
        path: '.cursor/cli.json',
        content: JSON.stringify({ permissions: { allow: [], deny: [] } }, null, 2),
      },
    ]);
  });

  it('leaves out an unmanaged list, so the merge keeps the user list', () => {
    expect(generatePermissions(makeCanonical({ permissions: { allow: ['Read'] } }))).toEqual([
      {
        path: '.cursor/cli.json',
        content: JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2),
      },
    ]);
    expect(generatePermissions(makeCanonical({ permissions: { deny: ['WebFetch'] } }))).toEqual([
      {
        path: '.cursor/cli.json',
        content: JSON.stringify({ permissions: { deny: ['WebFetch'] } }, null, 2),
      },
    ]);
  });

  it('returns empty when only ask is managed, since Cursor reads no ask list', () => {
    expect(generatePermissions(makeCanonical({ permissions: { ask: ['Write'] } }))).toEqual([]);
  });
});

describe('generateHooks (cursor)', () => {
  it('generates .cursor/hooks.json with camelCase events and a flat hook array', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.cursor/hooks.json');
    const parsed = JSON.parse(results[0]!.content) as {
      version: number;
      hooks: { postToolUse: Array<{ matcher?: string; type: string; command: string }> };
    };
    expect(parsed.version).toBe(1);
    // Canonical PascalCase event maps to Cursor's camelCase event name.
    expect(parsed.hooks).not.toHaveProperty('PostToolUse');
    expect(parsed.hooks.postToolUse).toHaveLength(1);
    expect(parsed.hooks.postToolUse[0]).toMatchObject({
      type: 'command',
      command: 'prettier --write $FILE_PATH',
      matcher: 'Write|Edit',
    });
    // Flat array — no nested { matcher, hooks: [...] } wrapper.
    expect(parsed.hooks.postToolUse[0]).not.toHaveProperty('hooks');
  });

  it('returns empty when hooks is null', () => {
    expect(generateHooks(makeCanonical({ hooks: null }))).toEqual([]);
  });

  it('returns empty when hooks has no entries', () => {
    expect(generateHooks(makeCanonical({ hooks: {} }))).toEqual([]);
  });

  it('returns empty when only unmappable events are present', () => {
    // Notification has no Cursor equivalent and is dropped.
    const canonical = makeCanonical({
      hooks: { Notification: [{ matcher: '*', command: 'notify' }] },
    });
    expect(generateHooks(canonical)).toEqual([]);
  });

  it('generates prompt-type hooks when type is prompt', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Write',
            command: '',
            type: 'prompt' as const,
            prompt: 'Run prettier on the edited file',
          },
        ],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as {
      hooks: { postToolUse: Array<{ type: string; prompt?: string; command: string }> };
    };
    expect(parsed.hooks.postToolUse[0]!).toMatchObject({
      type: 'prompt',
      prompt: 'Run prettier on the edited file',
    });
  });

  it('includes timeout when specified in hook entry', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Write',
            command: 'prettier --write $FILE_PATH',
            type: 'command' as const,
            timeout: 5000,
          },
        ],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as {
      hooks: { postToolUse: Array<{ timeout?: number }> };
    };
    expect(parsed.hooks.postToolUse[0]!.timeout).toBe(5000);
  });

  it('returns empty when all hook entries lack command and prompt', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: '', type: 'command' as const }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(0);
  });

  it('skips non-array hook values', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier', type: 'command' as const }],
        PreToolUse: 'invalid' as unknown as import('../../../../src/core/types.js').HookEntry[],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as { hooks: Record<string, unknown> };
    expect(parsed.hooks.postToolUse).toBeDefined();
    expect(parsed.hooks.preToolUse).toBeUndefined();
  });

  it('round-trips canonical -> cursor -> canonical for mapped events', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', type: 'command' as const, command: 'echo hi', timeout: 3 }],
        UserPromptSubmit: [{ matcher: '', type: 'command' as const, command: 'validate' }],
      },
    });
    const json = JSON.parse(generateHooks(canonical)[0]!.content) as {
      hooks: Record<string, unknown>;
    };
    expect(cursorHooksToCanonical(json.hooks)).toEqual({
      PreToolUse: [{ matcher: 'Bash', type: 'command', command: 'echo hi', timeout: 3 }],
      UserPromptSubmit: [{ matcher: '', type: 'command', command: 'validate' }],
    });
  });
});

describe('generateIgnore (cursor)', () => {
  it('generates only .cursorignore from canonical ignore patterns', () => {
    const canonical = makeCanonical({
      ignore: ['node_modules', '.env', 'coverage/'],
    });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.cursorignore');
    expect(results[0]!.content).toBe('node_modules\n.env\ncoverage/');
  });

  it('does not generate .cursorindexingignore (community-sourced, not official)', () => {
    const canonical = makeCanonical({ ignore: ['dist/'] });
    const results = generateIgnore(canonical);
    expect(results.every((r) => r.path !== '.cursorindexingignore')).toBe(true);
  });

  it('returns empty when ignore is empty', () => {
    expect(generateIgnore(makeCanonical({ ignore: [] }))).toEqual([]);
  });
});
