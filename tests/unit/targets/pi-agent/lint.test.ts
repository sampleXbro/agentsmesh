import { describe, it, expect } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { lintHooks, lintPermissions, lintIgnore } from '../../../../src/targets/pi-agent/lint.js';

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

describe('lintHooks (pi-agent)', () => {
  it('returns empty when no hooks', () => {
    expect(lintHooks(makeCanonical())).toHaveLength(0);
  });

  it('returns empty when hooks object has empty arrays', () => {
    expect(lintHooks(makeCanonical({ hooks: { preGenerate: [], postGenerate: [] } }))).toHaveLength(
      0,
    );
  });

  it('warns when hooks have entries', () => {
    const result = lintHooks(
      makeCanonical({
        hooks: { preGenerate: [{ command: 'echo test' }] },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
  });
});

describe('lintPermissions (pi-agent)', () => {
  it('returns empty when no permissions', () => {
    expect(lintPermissions(makeCanonical())).toHaveLength(0);
  });

  it('returns empty when allow is unmanaged and the other lists are empty', () => {
    expect(lintPermissions(makeCanonical({ permissions: { deny: [], ask: [] } }))).toHaveLength(0);
  });

  it('warns that a managed empty allow list switches every built-in off', () => {
    const result = lintPermissions(makeCanonical({ permissions: { allow: [] } }));
    expect(result.map((d) => d.message)).toEqual([
      expect.stringContaining('Pi starts with no tools'),
    ]);
  });

  it('warns when permissions have allow entries', () => {
    const result = lintPermissions(
      makeCanonical({ permissions: { allow: ['Bash'], deny: [], ask: [] } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
  });

  it('warns when permissions have deny entries', () => {
    const result = lintPermissions(
      makeCanonical({ permissions: { allow: [], deny: ['WebSearch'], ask: [] } }),
    );
    // the dropped deny list, plus the built-ins the empty projection disables
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
    expect(result[0].message).toContain('WebSearch');
  });

  it('warns when permissions have ask entries', () => {
    const result = lintPermissions(
      makeCanonical({ permissions: { allow: [], deny: [], ask: ['Bash'] } }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
    expect(result[0].message).toContain('no ask tier');
  });

  it('warns when permissions have entries but no ask field', () => {
    const result = lintPermissions(makeCanonical({ permissions: { allow: ['Bash'], deny: [] } }));
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
  });
});

describe('lintIgnore (pi-agent)', () => {
  it('returns empty when no ignore patterns', () => {
    expect(lintIgnore(makeCanonical())).toHaveLength(0);
  });

  it('warns when ignore patterns exist', () => {
    const result = lintIgnore(makeCanonical({ ignore: ['.env', 'node_modules/'] }));
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('warning');
    expect(result[0].target).toBe('pi-agent');
  });
});
