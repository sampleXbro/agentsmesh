import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  serializeGoosePermissions,
  parseGoosePermissions,
} from '../../../../src/targets/goose/permissions.js';
import { generateGooseScopeExtras } from '../../../../src/targets/goose/scope-extras.js';
import { importFromGoose } from '../../../../src/targets/goose/importer.js';
import { lintPermissions } from '../../../../src/targets/goose/lint.js';

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

const PERMS = { allow: ['developer__shell'], deny: ['developer__rm'], ask: ['memory__remember'] };

describe('serializeGoosePermissions', () => {
  it('maps canonical allow/deny/ask to the user category lists', () => {
    const yaml = serializeGoosePermissions(PERMS, null);
    const parsed = parseYaml(yaml!) as Record<string, Record<string, unknown>>;
    expect(parsed.user).toEqual({
      always_allow: ['developer__shell'],
      ask_before: ['memory__remember'],
      never_allow: ['developer__rm'],
    });
  });

  it('merge-preserves the runtime smart_approve category', () => {
    const existing =
      'smart_approve:\n  always_allow:\n    - cached__tool\nuser:\n  always_allow:\n    - stale\n';
    const yaml = serializeGoosePermissions(PERMS, existing);
    const parsed = parseYaml(yaml!) as Record<string, Record<string, unknown>>;
    expect(parsed.smart_approve).toEqual({ always_allow: ['cached__tool'] });
    expect(parsed.user.always_allow).toEqual(['developer__shell']);
  });

  it('returns null when there is nothing to emit', () => {
    expect(serializeGoosePermissions(null, null)).toBeNull();
    expect(serializeGoosePermissions({ allow: [], deny: [], ask: [] }, null)).toBeNull();
  });

  it('leaves the file alone when no list is managed', () => {
    expect(serializeGoosePermissions(null, 'user:\n  always_allow:\n    - mine\n')).toBeNull();
  });

  it('keeps the user category lists that permissions.yaml does not manage', () => {
    const existing =
      'user:\n  always_allow:\n    - old\n  ask_before:\n    - mine__ask\n  never_allow:\n    - mine__deny\n';
    const parsed = parseYaml(serializeGoosePermissions({ allow: ['developer__shell'] }, existing)!);
    expect(parsed).toEqual({
      user: {
        always_allow: ['developer__shell'],
        ask_before: ['mine__ask'],
        never_allow: ['mine__deny'],
      },
    });
  });

  it('clears a managed empty list and keeps the rest', () => {
    const existing = 'user:\n  always_allow:\n    - old\n  never_allow:\n    - mine__deny\n';
    const parsed = parseYaml(serializeGoosePermissions({ allow: [] }, existing)!);
    expect(parsed).toEqual({ user: { never_allow: ['mine__deny'] } });
  });
});

describe('parseGoosePermissions', () => {
  it('reads the user category back into canonical permissions', () => {
    const perms = parseGoosePermissions(
      'user:\n  always_allow:\n    - developer__shell\n  never_allow:\n    - developer__rm\n  ask_before:\n    - memory__remember\nsmart_approve:\n  always_allow:\n    - cached\n',
    );
    expect(perms).toEqual(PERMS);
  });

  it('returns null when there is no user category', () => {
    expect(parseGoosePermissions('smart_approve:\n  always_allow:\n    - cached\n')).toBeNull();
    expect(parseGoosePermissions('')).toBeNull();
  });
});

describe('generateGooseScopeExtras — permissions', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'goose-perms-gen-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('emits .config/goose/permission.yaml in global scope when permissions enabled', async () => {
    const results = await generateGooseScopeExtras(
      canonical({ permissions: PERMS }),
      dir,
      'global',
      new Set(['permissions']),
    );
    const perm = results.find((r) => r.path === '.config/goose/permission.yaml');
    expect(perm).toBeDefined();
    const parsed = parseYaml(perm!.content) as Record<string, Record<string, unknown>>;
    expect(parsed.user.always_allow).toEqual(['developer__shell']);
  });

  it('does not emit permissions in project scope', async () => {
    const results = await generateGooseScopeExtras(
      canonical({ permissions: PERMS }),
      dir,
      'project',
      new Set(['permissions']),
    );
    expect(results).toEqual([]);
  });
});

describe('importFromGoose — permissions', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'goose-perms-imp-'));
    mkdirSync(join(dir, '.config/goose'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('imports the global permission.yaml user block into canonical permissions.yaml', async () => {
    writeFileSync(
      join(dir, '.config/goose/permission.yaml'),
      'user:\n  always_allow:\n    - developer__shell\n  never_allow:\n    - developer__rm\n  ask_before:\n    - memory__remember\n',
    );
    const results = await importFromGoose(dir, { scope: 'global' });
    const permResult = results.find((r) => r.feature === 'permissions');
    expect(permResult).toBeDefined();
    expect(permResult!.toPath).toBe('.agentsmesh/permissions.yaml');
    const written = parseYaml(readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8'));
    expect(written).toEqual(PERMS);
  });

  it('does not import permissions in project scope', async () => {
    writeFileSync(join(dir, '.config/goose/permission.yaml'), 'user:\n  always_allow:\n    - x\n');
    const results = await importFromGoose(dir, { scope: 'project' });
    expect(results.find((r) => r.feature === 'permissions')).toBeUndefined();
  });
});

describe('lintPermissions (goose) is scope-aware', () => {
  it('warns at project scope (no project permission file)', () => {
    const diags = lintPermissions(canonical({ permissions: PERMS }), { scope: 'project' });
    expect(diags).toHaveLength(1);
    expect(diags[0]!.level).toBe('warning');
  });

  it('is silent at global scope (permissions are native there)', () => {
    expect(lintPermissions(canonical({ permissions: PERMS }), { scope: 'global' })).toEqual([]);
  });
});
