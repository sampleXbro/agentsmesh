/**
 * Branch coverage for src/canonical/features/permissions.ts and validate-name.ts.
 * - parsePermissions: empty content branch (line 22).
 * - parsePermissions: non-object parsed value branch.
 * - assertNoBasenameCollisions: basename without separator (line 59).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parsePermissions } from '../../../src/canonical/features/permissions.js';
import {
  assertCanonicalName,
  assertNoBasenameCollisions,
  CanonicalNameError,
} from '../../../src/canonical/features/validate-name.js';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-canon-feats-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parsePermissions — branch coverage', () => {
  it('returns null when file is whitespace-only', async () => {
    const p = join(dir, 'permissions.yaml');
    writeFileSync(p, '   \n  \n');
    expect(await parsePermissions(p)).toBeNull();
  });

  it('rejects when YAML parse fails', async () => {
    const p = join(dir, 'permissions.yaml');
    writeFileSync(p, 'allow:\n  - x\n  invalid yaml: : :\n');
    await expect(parsePermissions(p)).rejects.toMatchObject({ code: 'AM_CONFIG_INVALID' });
  });

  it('returns null when parsed YAML is a scalar (string)', async () => {
    const p = join(dir, 'permissions.yaml');
    writeFileSync(p, 'just-a-scalar-string');
    expect(await parsePermissions(p)).toBeNull();
  });

  it('returns null when file is missing', async () => {
    expect(await parsePermissions(join(dir, 'nope.yaml'))).toBeNull();
  });

  it('filters non-string entries from allow/deny/ask arrays', async () => {
    const p = join(dir, 'permissions.yaml');
    writeFileSync(p, 'allow:\n  - "Bash(*)"\n  - 42\ndeny: ["bad", true]\nask: []\n');
    const result = await parsePermissions(p);
    expect(result?.allow).toEqual(['Bash(*)']);
    expect(result?.deny).toEqual(['bad']);
  });
});

describe('assertNoBasenameCollisions — branch coverage', () => {
  it('treats a path without separator as its own basename (idx === -1 branch)', () => {
    expect(() => assertNoBasenameCollisions('rule', ['only.md'], '.md')).not.toThrow();
  });

  it('detects collision when two paths collapse to same slug across nesting', () => {
    expect(() =>
      assertNoBasenameCollisions('rule', ['rules/foo.md', 'rules/sub/foo.md'], '.md'),
    ).toThrow(CanonicalNameError);
  });

  it('detects collision on Windows backslash paths', () => {
    expect(() =>
      assertNoBasenameCollisions('rule', ['rules\\foo.md', 'rules\\sub\\foo.md'], '.md'),
    ).toThrow(CanonicalNameError);
  });

  it('does not throw when same path appears twice (only different paths collide)', () => {
    expect(() =>
      assertNoBasenameCollisions('rule', ['rules/foo.md', 'rules/foo.md'], '.md'),
    ).not.toThrow();
  });

  it('keeps base unchanged when it does not end with stripExt', () => {
    expect(() => assertNoBasenameCollisions('skill', ['foo.toml'], '.md')).not.toThrow();
  });
});

describe('assertCanonicalName — Windows portability gate', () => {
  it('rejects Windows reserved device names (CON, AUX, etc.)', () => {
    expect(() => assertCanonicalName('rule', 'CON')).toThrow(CanonicalNameError);
  });

  it('accepts safe names', () => {
    expect(() => assertCanonicalName('rule', 'safe-name')).not.toThrow();
  });
});
