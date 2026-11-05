import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  serializeContinuePermissions,
  parseContinuePermissions,
} from '../../../../src/targets/continue/permissions.js';
import { generateContinueScopeExtras } from '../../../../src/targets/continue/scope-extras.js';
import { importFromContinue } from '../../../../src/targets/continue/importer.js';

function canonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
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

describe('serializeContinuePermissions', () => {
  it('maps canonical allow/ask/deny to Continue allow/ask/exclude', () => {
    const yaml = serializeContinuePermissions(
      { allow: ['Read(*)'], deny: ['Write'], ask: ['Bash'] },
      null,
    );
    const parsed = parseYaml(yaml!) as Record<string, unknown>;
    expect(parsed).toEqual({ allow: ['Read(*)'], ask: ['Bash'], exclude: ['Write'] });
  });

  it('keeps managed empty lists and returns null when nothing to emit', () => {
    expect(serializeContinuePermissions(null, null)).toBeNull();
    expect(serializeContinuePermissions({ allow: [], deny: [], ask: [] }, null)).toBeNull();
    const yaml = serializeContinuePermissions({ allow: ['Read'], deny: [] }, null);
    const parsed = parseYaml(yaml!) as Record<string, unknown>;
    expect(parsed).toEqual({ allow: ['Read'], exclude: [] });
  });
});

describe('parseContinuePermissions', () => {
  it('maps Continue allow/ask/exclude back to canonical allow/ask/deny', () => {
    const perms = parseContinuePermissions(
      'allow:\n  - Read(*)\nask:\n  - Bash\nexclude:\n  - Write\n',
    );
    expect(perms).toEqual({ allow: ['Read(*)'], deny: ['Write'], ask: ['Bash'] });
  });

  it('returns null for empty/invalid input', () => {
    expect(parseContinuePermissions('')).toBeNull();
    expect(parseContinuePermissions('not: relevant\n')).toBeNull();
    expect(parseContinuePermissions('[1, 2, 3]')).toBeNull();
  });
});

describe('generateContinueScopeExtras — permissions', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'continue-perms-gen-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('emits .continue/permissions.yaml in global scope when permissions enabled', async () => {
    const results = await generateContinueScopeExtras(
      canonical({ permissions: { allow: ['Read(*)'], deny: ['Write'], ask: ['Bash'] } }),
      dir,
      'global',
      new Set(['permissions']),
    );
    const perm = results.find((r) => r.path === '.continue/permissions.yaml');
    expect(perm).toBeDefined();
    const parsed = parseYaml(perm!.content) as Record<string, unknown>;
    expect(parsed).toEqual({ allow: ['Read(*)'], ask: ['Bash'], exclude: ['Write'] });
  });

  it('does not emit permissions in project scope', async () => {
    const results = await generateContinueScopeExtras(
      canonical({ permissions: { allow: ['Read'], deny: [] } }),
      dir,
      'project',
      new Set(['permissions']),
    );
    expect(results.find((r) => r.path === '.continue/permissions.yaml')).toBeUndefined();
  });

  it('does not emit permissions when the feature is disabled', async () => {
    const results = await generateContinueScopeExtras(
      canonical({ permissions: { allow: ['Read'], deny: [] } }),
      dir,
      'global',
      new Set(['rules']),
    );
    expect(results.find((r) => r.path === '.continue/permissions.yaml')).toBeUndefined();
  });
});

describe('importFromContinue — permissions', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'continue-perms-imp-'));
    mkdirSync(join(dir, '.continue'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('imports global .continue/permissions.yaml into canonical permissions.yaml', async () => {
    writeFileSync(
      join(dir, '.continue/permissions.yaml'),
      'allow:\n  - Read(*)\nask:\n  - Bash\nexclude:\n  - Write\n',
    );
    const results = await importFromContinue(dir, { scope: 'global' });
    const permResult = results.find((r) => r.feature === 'permissions');
    expect(permResult).toBeDefined();
    expect(permResult!.toPath).toBe('.agentsmesh/permissions.yaml');
    const written = parseYaml(readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8'));
    expect(written).toEqual({ allow: ['Read(*)'], deny: ['Write'], ask: ['Bash'] });
  });

  it('does not import permissions in project scope', async () => {
    writeFileSync(join(dir, '.continue/permissions.yaml'), 'allow:\n  - Read\n');
    const results = await importFromContinue(dir, { scope: 'project' });
    expect(results.find((r) => r.feature === 'permissions')).toBeUndefined();
  });
});
