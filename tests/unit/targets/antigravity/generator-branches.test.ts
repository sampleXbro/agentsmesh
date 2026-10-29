/**
 * Branch coverage tests for src/targets/antigravity/generator.ts.
 * Targets:
 *   - generateRules: empty body trim → '' fallback, target filter exclude / include
 *   - generateCommands: intro+body branching (intro startsWith body, body absent, intro absent)
 *   - emitAntigravityMcp: null + empty mcpServers branches
 *   - renderAntigravityGlobalInstructions: missing root.body fallback (??),
 *     non-root rule include vs exclude branches
 */
import { describe, it, expect } from 'vitest';
import {
  generateRules,
  generateCommands,
  renderAntigravityGlobalInstructions,
} from '../../../../src/targets/antigravity/generator.js';
import { emitAntigravityMcp } from '../../../../src/targets/antigravity/mcp-settings.js';
import {
  ANTIGRAVITY_RULES_ROOT,
  ANTIGRAVITY_RULES_DIR,
  ANTIGRAVITY_WORKFLOWS_DIR,
} from '../../../../src/targets/antigravity/constants.js';
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

describe('antigravity generateRules — branches', () => {
  it('emits empty string when root body is whitespace only (trim() || "" branch)', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '   \n\n  ',
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe(ANTIGRAVITY_RULES_ROOT);
    expect(result[0]!.content).toContain('trigger: always_on');
  });

  it('keeps non-root rule when targets includes "antigravity"', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '# r',
          },
          {
            source: '/p/.agentsmesh/rules/ag-only.md',
            root: false,
            targets: ['antigravity'],
            description: '',
            globs: [],
            body: 'B',
          },
        ],
      }),
    );
    expect(result.some((r) => r.path === `${ANTIGRAVITY_RULES_DIR}/ag-only.md`)).toBe(true);
  });

  it('emits empty string for non-root rule whose body is whitespace only', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '# r',
          },
          {
            source: '/p/.agentsmesh/rules/empty.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: '\n  \n',
          },
        ],
      }),
    );
    const empty = result.find((r) => r.path === `${ANTIGRAVITY_RULES_DIR}/empty.md`);
    expect(empty).toBeDefined();
    expect(empty!.content).toContain('trigger: always_on');
  });
});

describe('antigravity generateCommands — intro/body branches', () => {
  it('returns body alone when body already starts with intro (startsWith short-circuit)', () => {
    const result = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/p/.agentsmesh/commands/c.md',
            name: 'c',
            description: 'Run things',
            allowedTools: [],
            body: 'Run things, then test.',
          },
        ],
      }),
    );
    expect(result[0]!.path).toBe(`${ANTIGRAVITY_WORKFLOWS_DIR}/c.md`);
    expect(result[0]!.content).toBe('Run things, then test.');
  });

  it('returns intro alone when body is empty', () => {
    const result = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/p/.agentsmesh/commands/intro-only.md',
            name: 'intro-only',
            description: 'Only an intro line',
            allowedTools: [],
            body: '   ',
          },
        ],
      }),
    );
    expect(result[0]!.content).toBe('Only an intro line');
  });

  it('returns body alone when intro is empty', () => {
    const result = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/p/.agentsmesh/commands/body-only.md',
            name: 'body-only',
            description: '',
            allowedTools: [],
            body: 'Just the body content.',
          },
        ],
      }),
    );
    expect(result[0]!.content).toBe('Just the body content.');
  });

  it('joins intro + body when neither is contained in the other', () => {
    const result = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/p/.agentsmesh/commands/joined.md',
            name: 'joined',
            description: 'Intro line',
            allowedTools: [],
            body: '1. Step one\n2. Step two',
          },
        ],
      }),
    );
    expect(result[0]!.content).toBe('Intro line\n\n1. Step one\n2. Step two');
  });
});

describe('antigravity emitAntigravityMcp — empty branches', () => {
  const mcpEnabled = new Set(['mcp']);

  it('returns [] when canonical.mcp is null', () => {
    expect(emitAntigravityMcp(makeCanonical(), 'project', mcpEnabled)).toEqual([]);
  });

  it('returns [] when mcpServers is empty', () => {
    expect(
      emitAntigravityMcp(makeCanonical({ mcp: { mcpServers: {} } }), 'project', mcpEnabled),
    ).toEqual([]);
  });
});

describe('renderAntigravityGlobalInstructions — fallback branches', () => {
  it('falls back to empty string when no root rule exists (root?.body.trim() ?? "")', () => {
    const out = renderAntigravityGlobalInstructions(makeCanonical());
    expect(typeof out).toBe('string');
  });

  it('includes non-root rules whose targets are empty (cross-target)', () => {
    const out = renderAntigravityGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '# Root body',
          },
          {
            source: '/p/.agentsmesh/rules/cross.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: 'CROSS_RULE_BODY',
          },
        ],
      }),
    );
    expect(out).toContain('CROSS_RULE_BODY');
  });

  it('excludes non-root rules whose targets are not "antigravity"', () => {
    const out = renderAntigravityGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '# Root',
          },
          {
            source: '/p/.agentsmesh/rules/cursor-only.md',
            root: false,
            targets: ['cursor'],
            description: '',
            globs: [],
            body: 'CURSOR_BODY_DO_NOT_INCLUDE',
          },
        ],
      }),
    );
    expect(out).not.toContain('CURSOR_BODY_DO_NOT_INCLUDE');
  });
});
