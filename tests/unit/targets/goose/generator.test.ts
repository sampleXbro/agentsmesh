import { describe, it, expect } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  generateRules,
  generateSkills,
  generateCommands,
  generateAgents,
  generateIgnore,
  generateHooks,
} from '../../../../src/targets/goose/generator.js';
import { emitGooseProjectMcp } from '../../../../src/targets/goose/mcp-settings.js';
import { generateGooseGlobalMcp } from '../../../../src/targets/goose/global-mcp.js';
import {
  GOOSE_ROOT_FILE,
  GOOSE_SKILLS_DIR,
  GOOSE_GLOBAL_CONFIG,
  GOOSE_HOOKS_FILE,
  GOOSE_PROJECT_MCP_FILE,
} from '../../../../src/targets/goose/constants.js';

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

describe('generateRules (goose)', () => {
  it('generates .goosehints for the root rule', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root\n\nUse TDD and strict TypeScript.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(GOOSE_ROOT_FILE);
    expect(results[0].content).toContain('Use TDD and strict TypeScript.');
  });

  it('embeds non-root rules in .goosehints', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root instructions',
        },
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TypeScript standards',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(GOOSE_ROOT_FILE);
    expect(results[0].content).toContain('# Root instructions');
    expect(results[0].content).toContain('Use strict mode.');
  });

  it('filters rules targeted to other tools', () => {
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
          description: 'Cursor-specific',
          globs: [],
          body: 'Only for Cursor.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).not.toContain('Only for Cursor.');
  });

  it('returns empty when no rules exist', () => {
    const canonical = makeCanonical({ rules: [] });
    const results = generateRules(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateSkills (goose)', () => {
  it('generates skills to .agents/skills/', () => {
    const canonical = makeCanonical({
      skills: [
        {
          name: 'debugging',
          source: '/proj/.agentsmesh/skills/debugging/SKILL.md',
          description: 'Debug workflow',
          body: '# Debugging\n\nReproduce first.',
          supportingFiles: [
            {
              relativePath: 'references/checklist.md',
              content: '# Checklist\n\n- Reproduce issue',
            },
          ],
        },
      ],
    });

    const results = generateSkills(canonical);

    expect(results.length).toBeGreaterThanOrEqual(2);
    const skillFile = results.find((r) => r.path === `${GOOSE_SKILLS_DIR}/debugging/SKILL.md`);
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('name:');
    expect(skillFile!.content).toContain('description:');
    expect(skillFile!.content).toContain('Debug workflow');
    const refFile = results.find(
      (r) => r.path === `${GOOSE_SKILLS_DIR}/debugging/references/checklist.md`,
    );
    expect(refFile).toBeDefined();
    expect(refFile!.content).toContain('Reproduce issue');
  });

  it('returns empty when no skills exist', () => {
    const canonical = makeCanonical({ skills: [] });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateCommands (goose)', () => {
  it('projects commands as skill bundles with command frontmatter', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/review.md',
          name: 'review',
          description: 'Review code changes',
          allowedTools: ['Read', 'Grep', 'Bash(git diff)'],
          body: 'Review the current diff.',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${GOOSE_SKILLS_DIR}/am-command-review/SKILL.md`);
    expect(results[0].content).toContain('x-agentsmesh-kind: command');
    expect(results[0].content).toContain('x-agentsmesh-name: review');
    expect(results[0].content).toContain('name: am-command-review');
    expect(results[0].content).toContain('description: Review code changes');
    expect(results[0].content).toContain('x-agentsmesh-allowed-tools:');
    expect(results[0].content).toContain('- Read');
    expect(results[0].content).toContain('Review the current diff.');
  });

  it('returns empty when no commands exist', () => {
    expect(generateCommands(makeCanonical())).toHaveLength(0);
  });
});

describe('generateAgents (goose)', () => {
  it('projects agents as skill bundles with agent frontmatter', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/reviewer.md',
          name: 'reviewer',
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
          body: 'You review code.',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${GOOSE_SKILLS_DIR}/am-agent-reviewer/SKILL.md`);
    expect(results[0].content).toContain('x-agentsmesh-kind: agent');
    expect(results[0].content).toContain('x-agentsmesh-name: reviewer');
    expect(results[0].content).toContain('name: am-agent-reviewer');
    expect(results[0].content).toContain('description: Reviews code for quality');
    expect(results[0].content).toContain('x-agentsmesh-tools:');
    expect(results[0].content).toContain('x-agentsmesh-model: sonnet');
    expect(results[0].content).toContain('You review code.');
  });

  it('returns empty when no agents exist', () => {
    expect(generateAgents(makeCanonical())).toHaveLength(0);
  });
});

describe('generateIgnore (goose)', () => {
  it('does not emit the obsolete .gooseignore file', () => {
    const canonical = makeCanonical({
      ignore: ['.env', 'node_modules/', 'dist/'],
    });

    const results = generateIgnore(canonical);

    expect(results).toEqual([]);
  });

  it('returns empty when no ignore patterns exist', () => {
    const canonical = makeCanonical({ ignore: [] });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('goose MCP emission', () => {
  it('writes the plugin .mcp.json for project scope', () => {
    const canonical = makeCanonical({
      mcp: { mcpServers: { 'my-server': { command: 'cmd', args: [], env: {}, type: 'stdio' } } },
    });
    const results = emitGooseProjectMcp(canonical, 'project', new Set(['mcp']));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(GOOSE_PROJECT_MCP_FILE);
  });

  it('returns empty for global scope with no MCP servers', async () => {
    expect(
      await generateGooseGlobalMcp(makeCanonical({ mcp: null }), '/nonexistent', new Set(['mcp'])),
    ).toHaveLength(0);
  });

  it('generates config.yaml with extensions block for global scope', async () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          'my-server': {
            command: '/usr/local/bin/my-mcp',
            args: ['--port', '3000'],
            env: { API_KEY: 'abc' },
            type: 'stdio',
          },
        },
      },
    });
    const results = await generateGooseGlobalMcp(canonical, '/nonexistent', new Set(['mcp']));
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(GOOSE_GLOBAL_CONFIG);
    expect(results[0].content).toContain('extensions:');
    expect(results[0].content).toContain('my-server:');
    expect(results[0].content).toContain('cmd: /usr/local/bin/my-mcp');
    expect(results[0].content).toContain('type: stdio');
    expect(results[0].content).toContain('API_KEY');
  });
});

describe('generateHooks (goose)', () => {
  it('returns [] when hooks is null', () => {
    expect(generateHooks(makeCanonical())).toHaveLength(0);
  });

  it('emits the plugin hooks.json wrapped under a top-level "hooks" key', () => {
    const results = generateHooks(
      makeCanonical({
        hooks: {
          PostToolUse: [
            { matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH', type: 'command' },
          ],
        },
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(GOOSE_HOOKS_FILE);
    const parsed = JSON.parse(results[0].content) as { hooks?: Record<string, unknown> };
    expect(parsed.PostToolUse).toBeUndefined();
    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks!.PostToolUse).toBeDefined();
  });

  it('drops prompt-type handlers (Open Plugin hooks are command-only)', () => {
    const results = generateHooks(
      makeCanonical({
        hooks: { UserPromptSubmit: [{ matcher: '.*', type: 'prompt', command: 'Review this' }] },
      }),
    );
    expect(results).toHaveLength(0);
  });
});
