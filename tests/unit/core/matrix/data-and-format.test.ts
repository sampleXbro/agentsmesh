import { afterEach, describe, expect, it } from 'vitest';
import {
  LEVEL_SYMBOL,
  SUPPORT_MATRIX,
  SUPPORT_MATRIX_GLOBAL,
  coloredSymbol,
} from '../../../../src/core/matrix/data.js';
import { formatMatrix } from '../../../../src/core/matrix/format-table.js';
import type { CompatibilityRow } from '../../../../src/core/types.js';

const originalNoColor = process.env.NO_COLOR;
const originalForceColor = process.env.FORCE_COLOR;
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[`);

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
  if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = originalForceColor;
});

describe('SUPPORT_MATRIX', () => {
  it('contains all standard feature ids', () => {
    expect(Object.keys(SUPPORT_MATRIX).sort()).toEqual(
      [
        'rules',
        'additionalRules',
        'commands',
        'agents',
        'skills',
        'mcp',
        'hooks',
        'ignore',
        'permissions',
      ].sort(),
    );
  });

  it('every cell has a level', () => {
    for (const targetMap of Object.values(SUPPORT_MATRIX)) {
      for (const cell of Object.values(targetMap)) {
        expect(['native', 'embedded', 'partial', 'none']).toContain(cell.level);
      }
    }
  });
});

describe('SUPPORT_MATRIX_GLOBAL', () => {
  const ALL_FEATURES = [
    'rules',
    'additionalRules',
    'commands',
    'agents',
    'skills',
    'mcp',
    'hooks',
    'ignore',
    'permissions',
  ] as const;

  it('contains exactly the standard feature ids', () => {
    expect(Object.keys(SUPPORT_MATRIX_GLOBAL).sort()).toEqual([...ALL_FEATURES].sort());
  });

  it('jules reports none for every feature (cloud-only, no globalSupport)', () => {
    for (const feature of ALL_FEATURES) {
      expect(SUPPORT_MATRIX_GLOBAL[feature].jules.level).toBe('none');
    }
  });

  it('replit-agent reports none for every feature (cloud-only, no globalSupport)', () => {
    for (const feature of ALL_FEATURES) {
      expect(SUPPORT_MATRIX_GLOBAL[feature]['replit-agent'].level).toBe('none');
    }
  });

  it('claude-code reports embedded ignore and native remaining global features', () => {
    for (const feature of ALL_FEATURES) {
      expect(SUPPORT_MATRIX_GLOBAL[feature]['claude-code'].level)
        .toBe(feature === 'ignore' ? 'embedded' : 'native');
    }
  });
});

describe('coloredSymbol', () => {
  it('returns plain symbol when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(coloredSymbol('native')).toBe(LEVEL_SYMBOL.native);
    expect(coloredSymbol('none')).toBe(LEVEL_SYMBOL.none);
  });

  it('returns ANSI-wrapped symbol when color is forced', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    expect(coloredSymbol('native')).toContain(LEVEL_SYMBOL.native);
    expect(coloredSymbol('native')).toMatch(ANSI_ESCAPE_PATTERN);
  });

  it('treats an empty NO_COLOR as "not disabled" (still colors when forced)', () => {
    process.env.NO_COLOR = '';
    process.env.FORCE_COLOR = '1';
    expect(coloredSymbol('partial')).toContain(LEVEL_SYMBOL.partial);
    expect(coloredSymbol('partial')).toMatch(ANSI_ESCAPE_PATTERN);
  });

  it('returns a plain symbol on a non-TTY when NO_COLOR is unset', () => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    expect(coloredSymbol('native')).toBe(LEVEL_SYMBOL.native);
  });
});

const MAKE_ROW = (
  feature: string,
  support: Record<string, 'native' | 'none' | 'partial' | 'embedded'>,
): CompatibilityRow => ({
  feature,
  count: 0,
  support,
});

describe('formatMatrix (transposed)', () => {
  it('renders transposed table with NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    const out = formatMatrix(
      [MAKE_ROW('rules', { 'claude-code': 'native', cursor: 'embedded' })],
      ['claude-code', 'cursor'],
    );
    expect(out).toContain('Target');
    expect(out).toContain('Rules');
    expect(out).toContain(LEVEL_SYMBOL.native);
    expect(out).toContain(LEVEL_SYMBOL.embedded);
    expect(out).toContain('native');
  });

  it('renders ANSI codes when color is forced', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    const out = formatMatrix([MAKE_ROW('rules', { 'claude-code': 'native' })], ['claude-code']);
    expect(out).toMatch(ANSI_ESCAPE_PATTERN);
  });

  it('renders plain symbols on a non-TTY when NO_COLOR is unset', () => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    const out = formatMatrix([MAKE_ROW('rules', { 'claude-code': 'native' })], ['claude-code']);
    expect(out).not.toMatch(ANSI_ESCAPE_PATTERN);
    expect(out).toContain(LEVEL_SYMBOL.native);
  });

  it('uses "none" when target is missing in support map', () => {
    process.env.NO_COLOR = '1';
    const out = formatMatrix([MAKE_ROW('rules', {})], ['no-such-target']);
    expect(out).toContain(LEVEL_SYMBOL.none);
  });

  it('handles single target', () => {
    process.env.NO_COLOR = '1';
    const out = formatMatrix([MAKE_ROW('rules', { x: 'native' })], ['x']);
    expect(out).toContain('Rules');
  });

  it('handles empty rows', () => {
    process.env.NO_COLOR = '1';
    const out = formatMatrix([], ['claude-code']);
    expect(out).toContain('Target');
  });
});

describe('formatMatrix (transposed, NO_COLOR)', () => {
  const rows: CompatibilityRow[] = [
    { feature: 'rules', count: 0, support: { 'claude-code': 'native', cursor: 'native' } },
    { feature: 'commands', count: 0, support: { 'claude-code': 'native', cursor: 'embedded' } },
    { feature: 'permissions', count: 0, support: { 'claude-code': 'native', cursor: 'partial' } },
  ];
  const targets = ['claude-code', 'cursor'];

  it('renders one row per target with feature symbol columns', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      const out = formatMatrix(rows, targets);
      // Bordered table: the header carries the full feature names.
      expect(out).toContain('Target');
      expect(out).toContain('Rules');
      expect(out).toContain('Commands');
      expect(out).toContain('Permissions');
      // Each target is its own row (found between the │ borders) with its symbols.
      const claude = out.split('\n').find((l) => l.includes('│') && l.includes('Claude'))!;
      expect(claude).toContain('✓');
      const cursor = out.split('\n').find((l) => l.includes('│') && l.includes('cursor'))!;
      expect(cursor).toContain('✓'); // rules: native
      expect(cursor).toContain('◆'); // commands: embedded
      expect(cursor).toContain('◐'); // permissions: partial
      expect(out).toContain('✓ native');
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
  });

  it('sorts target rows by display label', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      const r: CompatibilityRow[] = [
        { feature: 'rules', count: 0, support: { zed: 'native', aider: 'native', 'claude-code': 'native' } },
      ];
      const out = formatMatrix(r, ['zed', 'aider', 'claude-code']);
      // Labels: aider→'aider', claude-code→'Claude', zed→'zed'; localeCompare: aider < Claude < zed.
      // Data rows carry a │ border and a ✓; the target label is the first cell.
      const order = out
        .split('\n')
        .filter((l) => l.includes('│') && l.includes('✓'))
        .map((l) => l.split('│')[1]!.trim());
      expect(order).toEqual(['aider', 'Claude', 'zed']);
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prev;
    }
  });
});
