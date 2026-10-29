import { describe, it, expect } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  generateRules,
  generateCommands,
  generateSkills,
  generateHooks,
} from '../../../../src/targets/antigravity/generator.js';
import { emitAntigravityMcp } from '../../../../src/targets/antigravity/mcp-settings.js';
import {
  ANTIGRAVITY_RULES_ROOT,
  ANTIGRAVITY_RULES_DIR,
  ANTIGRAVITY_WORKFLOWS_DIR,
  ANTIGRAVITY_SKILLS_DIR,
  ANTIGRAVITY_MCP_CONFIG,
  ANTIGRAVITY_HOOKS_FILE,
} from '../../../../src/targets/antigravity/constants.js';

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

describe('generateRules (antigravity)', () => {
  it('generates root rule as .agents/rules/general.md with required trigger', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: '# Project Rules\n\nUse TDD.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(ANTIGRAVITY_RULES_ROOT);
    expect(results[0]?.content).toContain('Use TDD.');
    expect(results[0]?.content).not.toContain('root: true');
    expect(results[0]?.content).toContain('trigger: always_on');
  });

  it('generates non-root rules as .agents/rules/{slug}.md with glob trigger', () => {
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
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TypeScript rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TypeScript.',
        },
      ],
    });
    const results = generateRules(canonical);
    const tsRule = results.find((r) => r.path === `${ANTIGRAVITY_RULES_DIR}/typescript.md`);
    expect(tsRule).toBeDefined();
    expect(tsRule!.content).toContain('Use strict TypeScript.');
    expect(tsRule!.content).toContain('globs:');
    expect(tsRule!.content).toContain('trigger: glob');
  });

  it('skips non-root rules targeting other agents only', () => {
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
          description: '',
          globs: [],
          body: 'Cursor only.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results.some((r) => r.path.includes('cursor-only'))).toBe(false);
  });

  it('generates standalone contextual rules when no root rule exists', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Use TypeScript.',
        },
      ],
    });
    expect(generateRules(canonical)).toHaveLength(1);
  });
});

describe('generateCommands (antigravity)', () => {
  it('projects canonical commands into .agents/workflows/{name}.md as plain markdown', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/review.md',
          name: 'review',
          description: 'Review workflow',
          allowedTools: ['Read', 'Bash(git diff)'],
          body: 'Review the current diff.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(`${ANTIGRAVITY_WORKFLOWS_DIR}/review.md`);
    expect(results[0]?.content).toContain('Review the current diff.');
    expect(results[0]?.content).not.toContain('allowed-tools:');
    expect(results[0]?.content).not.toContain('x-agentsmesh');
  });

  it('returns empty array when no commands exist', () => {
    expect(generateCommands(makeCanonical())).toHaveLength(0);
  });

  it('includes description as intro when body does not start with it', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/test.md',
          name: 'test',
          description: 'Run tests before merging',
          allowedTools: [],
          body: '1. Run `pnpm test`\n2. Fix failures',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results[0]?.content).toContain('Run tests before merging');
    expect(results[0]?.content).toContain('pnpm test');
  });
});

describe('generateSkills (antigravity)', () => {
  it('generates skills under .agents/skills with SKILL.md and supporting files', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/typescript-pro/SKILL.md',
          name: 'typescript-pro',
          description: 'Helps with advanced TypeScript work',
          body: 'Use advanced TypeScript patterns.',
          supportingFiles: [
            {
              absolutePath: '/proj/.agentsmesh/skills/typescript-pro/references/advanced-types.md',
              relativePath: 'references/advanced-types.md',
              content: '# Advanced Types',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results.map((r) => r.path).sort()).toEqual([
      `${ANTIGRAVITY_SKILLS_DIR}/typescript-pro/SKILL.md`,
      `${ANTIGRAVITY_SKILLS_DIR}/typescript-pro/references/advanced-types.md`,
    ]);
    const skillMd = results.find((r) => r.path.endsWith('SKILL.md'));
    expect(skillMd?.content).toContain('name: typescript-pro');
    expect(skillMd?.content).toContain('description: Helps with advanced TypeScript work');
    expect(skillMd?.content).toContain('Use advanced TypeScript patterns.');
  });

  it('returns empty array when no skills exist', () => {
    expect(generateSkills(makeCanonical())).toHaveLength(0);
  });
});

describe('emitAntigravityMcp (antigravity)', () => {
  const mcpEnabled = new Set(['mcp']);

  it('emits mcp_config.json with mcpServers key', () => {
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
    const results = emitAntigravityMcp(canonical, 'project', mcpEnabled);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(ANTIGRAVITY_MCP_CONFIG);
    const parsed = JSON.parse(results[0]!.content);
    expect(parsed).toEqual({
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    });
  });

  it('returns empty array when mcp is null', () => {
    expect(emitAntigravityMcp(makeCanonical({ mcp: null }), 'project', mcpEnabled)).toEqual([]);
  });

  it('returns empty array when mcpServers is empty', () => {
    expect(
      emitAntigravityMcp(makeCanonical({ mcp: { mcpServers: {} } }), 'project', mcpEnabled),
    ).toEqual([]);
  });
});

describe('generateHooks (antigravity)', () => {
  it('returns [] when hooks is null', () => {
    expect(generateHooks(makeCanonical())).toHaveLength(0);
  });

  it('returns [] when hooks is empty', () => {
    expect(generateHooks(makeCanonical({ hooks: {} }))).toHaveLength(0);
  });

  it('emits .agents/hooks.json in Claude Code format', () => {
    const results = generateHooks(
      makeCanonical({
        hooks: { PreToolUse: [{ matcher: '*', command: 'echo hook', type: 'command' }] },
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(ANTIGRAVITY_HOOKS_FILE);
    const parsed = JSON.parse(results[0].content) as Record<string, unknown>;
    expect(parsed.PreToolUse).toBeDefined();
  });
});
