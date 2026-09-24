/**
 * Branch coverage tests for src/targets/windsurf/generator/rules.ts.
 * Targets:
 *   - empty canonical → []
 *   - no root rule → []
 *   - rule with targets array excluding 'windsurf' → skipped
 *   - rule with single glob → frontmatter has glob (not globs)
 *   - rule with multi-glob → frontmatter has globs (not glob)
 *   - rule with no description and no globs → no frontmatter wrapper
 *   - directoryScopedRuleDir branches: single dir (mirror), multi-segment, mismatched dirs
 *   - rule slug fallback when source is _root → 'root'
 *   - renderWindsurfGlobalInstructions: root-only, root+non-root, no-root, target filter
 */
import { describe, it, expect } from 'vitest';
import {
  generateRules,
  renderWindsurfGlobalInstructions,
} from '../../../../src/targets/windsurf/generator/rules.js';
import {
  WINDSURF_RULES_DIR,
  WINDSURF_AGENTS_MD,
} from '../../../../src/targets/windsurf/constants.js';
import { EMBEDDED_RULES_START } from '../../../../src/targets/projection/managed-blocks.js';
import type { CanonicalFiles, CanonicalRule } from '../../../../src/core/types.js';

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

function rootRule(): CanonicalRule {
  return {
    source: '/p/.agentsmesh/rules/_root.md',
    root: true,
    targets: [],
    description: 'Root',
    globs: [],
    body: '# Root\n\nRoot body.',
  };
}

describe('windsurf generateRules — empty / no-root branches', () => {
  it('returns [] when canonical has no rules', () => {
    expect(generateRules(makeCanonical())).toEqual([]);
  });

  it('returns [] when there is no root rule (only non-root)', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/ts.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: 'B',
          },
        ],
      }),
    );
    expect(result).toEqual([]);
  });
});

describe('windsurf generateRules — root + targets filter', () => {
  it('emits AGENTS.md from root and skips rules whose targets exclude "windsurf"', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/cursor-only.md',
            root: false,
            targets: ['cursor'],
            description: '',
            globs: [],
            body: 'C',
          },
          {
            source: '/p/.agentsmesh/rules/ts.md',
            root: false,
            targets: ['windsurf'],
            description: '',
            globs: [],
            body: 'T',
          },
        ],
      }),
    );
    const paths = result.map((r) => r.path);
    expect(paths).toContain(WINDSURF_AGENTS_MD);
    expect(paths.some((p) => p.endsWith('cursor-only.md'))).toBe(false);
    expect(paths).toContain(`${WINDSURF_RULES_DIR}/ts.md`);
  });
});

describe('windsurf generateRules — frontmatter glob/globs branches', () => {
  it('uses singular `glob` field with one glob', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/single.md',
            root: false,
            targets: [],
            description: 'TS rules',
            globs: ['src/**/*.ts'],
            body: 'B',
          },
        ],
      }),
    );
    const single = result.find((r) => r.path === `${WINDSURF_RULES_DIR}/single.md`);
    expect(single).toBeDefined();
    expect(single!.content).toContain('description: TS rules');
    expect(single!.content).toContain('glob: src/**/*.ts');
    expect(single!.content).not.toMatch(/^globs:/m);
  });

  it('uses plural `globs` field with multiple globs', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/multi.md',
            root: false,
            targets: [],
            description: '',
            globs: ['src/**/*.ts', 'tests/**/*.ts'],
            body: 'B',
          },
        ],
      }),
    );
    const multi = result.find((r) => r.path === `${WINDSURF_RULES_DIR}/multi.md`);
    expect(multi).toBeDefined();
    expect(multi!.content).toContain('globs:');
    expect(multi!.content).not.toMatch(/^glob:/m);
  });

  it('emits plain body (no frontmatter) when description+trigger+globs are all empty', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/plain.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: 'plain body content',
          },
        ],
      }),
    );
    const plain = result.find((r) => r.path === `${WINDSURF_RULES_DIR}/plain.md`);
    expect(plain).toBeDefined();
    expect(plain!.content).not.toMatch(/^---/);
    expect(plain!.content).toBe('plain body content');
  });
});

describe('windsurf generateRules — scoped rules', () => {
  // Windsurf applies a `trigger: glob` rule to the files its globs match and
  // also reads a `<dir>/AGENTS.md` as a rule for that folder, so a scoped rule
  // is written once: a `<dir>.md` copy or a nested AGENTS.md loaded it twice.
  it('writes a directory-scoped rule once, as its own glob rule', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/src-scope.md',
            root: false,
            targets: [],
            description: 'Src',
            globs: ['src/**/*.ts'],
            body: 'src-body',
          },
        ],
      }),
    );
    expect(result).toEqual([
      { path: 'AGENTS.md', content: '# Root\n\nRoot body.' },
      {
        path: `${WINDSURF_RULES_DIR}/src-scope.md`,
        content: '---\ndescription: Src\ntrigger: glob\nglob: src/**/*.ts\n---\n\nsrc-body',
      },
    ]);
  });

  it('writes a rule scoped to several folders once, with all its globs', () => {
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '/p/.agentsmesh/rules/mix.md',
            root: false,
            targets: [],
            description: '',
            globs: ['src/**/*.ts', 'tests/**/*.ts'],
            body: 'b',
          },
        ],
      }),
    );
    expect(result.map((r) => r.path)).toEqual(['AGENTS.md', `${WINDSURF_RULES_DIR}/mix.md`]);
  });

  it('uses "root" slug when source is _root.md (still skipped because rule.root=true)', () => {
    // Cover ruleSlug branch: source='_root' even on a non-root rule.
    const result = generateRules(
      makeCanonical({
        rules: [
          rootRule(),
          {
            source: '_root.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: 'shadow body',
          },
        ],
      }),
    );
    expect(result.some((r) => r.path === `${WINDSURF_RULES_DIR}/root.md`)).toBe(true);
  });
});

describe('renderWindsurfGlobalInstructions — branch coverage', () => {
  it('returns empty string when there is no root rule and no non-root rules', () => {
    const result = renderWindsurfGlobalInstructions(makeCanonical());
    expect(result).toBe('');
  });

  it('returns root body trimmed when there are no non-root rules', () => {
    const result = renderWindsurfGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: 'Root',
            globs: [],
            body: '  Use TypeScript.  \n',
          },
        ],
      }),
    );
    expect(result).toBe('Use TypeScript.');
    expect(result).not.toContain(EMBEDDED_RULES_START);
  });

  it('embeds non-root windsurf rules after root body', () => {
    const result = renderWindsurfGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: 'Root body.',
          },
          {
            source: '/p/.agentsmesh/rules/ts.md',
            root: false,
            targets: [],
            description: 'TypeScript rules',
            globs: ['src/**/*.ts'],
            body: 'Use strict mode.',
          },
        ],
      }),
    );
    expect(result).toContain('Root body.');
    expect(result).toContain(EMBEDDED_RULES_START);
    expect(result).toContain('Use strict mode.');
  });

  it('skips non-root rules whose targets exclude windsurf', () => {
    const result = renderWindsurfGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: 'Root.',
          },
          {
            source: '/p/.agentsmesh/rules/cursor-only.md',
            root: false,
            targets: ['cursor'],
            description: '',
            globs: [],
            body: 'Cursor only.',
          },
        ],
      }),
    );
    expect(result).not.toContain(EMBEDDED_RULES_START);
    expect(result).toBe('Root.');
  });

  it('includes non-root rules targeting windsurf explicitly', () => {
    const result = renderWindsurfGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: 'Root.',
          },
          {
            source: '/p/.agentsmesh/rules/windsurf-only.md',
            root: false,
            targets: ['windsurf'],
            description: '',
            globs: [],
            body: 'Windsurf specific.',
          },
        ],
      }),
    );
    expect(result).toContain(EMBEDDED_RULES_START);
    expect(result).toContain('Windsurf specific.');
  });

  it('returns empty string (no root body) and embeds rules when root is absent', () => {
    const result = renderWindsurfGlobalInstructions(
      makeCanonical({
        rules: [
          {
            source: '/p/.agentsmesh/rules/ts.md',
            root: false,
            targets: [],
            description: 'TS',
            globs: [],
            body: 'TS body.',
          },
        ],
      }),
    );
    // No root rule → root body is '' → appendEmbeddedRulesBlock returns the block only
    expect(result).toContain(EMBEDDED_RULES_START);
    expect(result).toContain('TS body.');
  });
});
