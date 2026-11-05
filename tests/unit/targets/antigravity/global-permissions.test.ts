/**
 * Global permissions (GAP 5). antigravity.google/docs/cli/permissions/ states the
 * three access lists live in `~/.gemini/antigravity-cli/settings.json`; there is
 * no repo-writable project tier, so this is a `scopeExtras` emitter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  getBuiltinTargetDefinition,
  getTargetLayout,
} from '../../../../src/targets/catalog/builtin-targets.js';
import { importFromAntigravity } from '../../../../src/targets/antigravity/importer.js';
import { ANTIGRAVITY_GLOBAL_SETTINGS_FILE } from '../../../../src/targets/antigravity/constants.js';

const TEST_DIR = join(tmpdir(), 'am-antigravity-global-permissions-test');
const ALL = new Set(['permissions']);

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

function writeSettings(content: string): void {
  mkdirSync(join(TEST_DIR, '.gemini', 'antigravity-cli'), { recursive: true });
  writeFileSync(join(TEST_DIR, ANTIGRAVITY_GLOBAL_SETTINGS_FILE), content);
}

const scopeExtras = getBuiltinTargetDefinition('antigravity')!.globalSupport!.scopeExtras!;

describe('antigravity global permissions — generate', () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it('writes the three access lists under a permissions key', async () => {
    const results = await scopeExtras(
      makeCanonical({ permissions: { allow: ['run_command(npm test)'], deny: [], ask: [] } }),
      TEST_DIR,
      'global',
      ALL,
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.gemini/antigravity-cli/settings.json');
    expect(results[0]!.target).toBe('antigravity');
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['permissions']);
    expect(parsed.permissions).toEqual({ allow: ['run_command(npm test)'] });
  });

  it('emits nothing at project scope', async () => {
    const results = await scopeExtras(
      makeCanonical({ permissions: { allow: ['run_command(npm test)'], deny: [], ask: [] } }),
      TEST_DIR,
      'project',
      ALL,
    );
    expect(results).toEqual([]);
  });

  it('emits nothing when the permissions feature is disabled', async () => {
    const results = await scopeExtras(
      makeCanonical({ permissions: { allow: ['run_command(npm test)'], deny: [], ask: [] } }),
      TEST_DIR,
      'global',
      new Set<string>(),
    );
    expect(results).toEqual([]);
  });

  it('emits nothing when canonical is silent and no settings file exists', async () => {
    expect(await scopeExtras(makeCanonical(), TEST_DIR, 'global', ALL)).toEqual([]);
  });

  it('emits nothing for managed empty lists and no settings file', async () => {
    const canonical = makeCanonical({ permissions: { allow: [], deny: [], ask: [] } });
    expect(await scopeExtras(canonical, TEST_DIR, 'global', ALL)).toEqual([]);
  });

  it('keeps unrelated user settings and unrelated permission sub-keys', async () => {
    writeSettings(
      JSON.stringify(
        {
          theme: 'dark',
          permissions: { allow: ['run_command(old)'], defaultMode: 'ask' },
        },
        null,
        2,
      ),
    );

    const results = await scopeExtras(
      makeCanonical({
        permissions: { allow: ['run_command(new)'], deny: ['write_file(*)'], ask: [] },
      }),
      TEST_DIR,
      'global',
      ALL,
    );

    const parsed = JSON.parse(results[0]!.content) as {
      theme: string;
      permissions: Record<string, unknown>;
    };
    expect(parsed.theme).toBe('dark');
    expect(parsed.permissions.defaultMode).toBe('ask');
    expect(parsed.permissions.allow).toEqual(['run_command(new)']);
    expect(parsed.permissions.deny).toEqual(['write_file(*)']);
  });

  it('clears a revoked grant instead of leaving it behind', async () => {
    writeSettings(
      JSON.stringify({ theme: 'dark', permissions: { allow: ['run_command(old)'] } }, null, 2),
    );

    const results = await scopeExtras(
      makeCanonical({ permissions: { allow: [] } }),
      TEST_DIR,
      'global',
      ALL,
    );

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    expect(parsed).toEqual({ theme: 'dark' });
  });

  it('leaves the settings file alone when no permissions.yaml manages a list', async () => {
    writeSettings(
      JSON.stringify({ theme: 'dark', permissions: { allow: ['run_command(mine)'] } }, null, 2),
    );

    expect(await scopeExtras(makeCanonical(), TEST_DIR, 'global', ALL)).toEqual([]);
  });

  it('keeps the user lists that permissions.yaml does not manage', async () => {
    writeSettings(
      JSON.stringify({
        permissions: {
          allow: ['run_command(old)'],
          deny: ['write_file(*)'],
          ask: ['view_file(*)'],
        },
      }),
    );

    const results = await scopeExtras(
      makeCanonical({ permissions: { allow: ['run_command(new)'] } }),
      TEST_DIR,
      'global',
      ALL,
    );

    expect(results.map((result) => result.path)).toEqual(['.gemini/antigravity-cli/settings.json']);
    expect(JSON.parse(results[0]!.content)).toEqual({
      permissions: { allow: ['run_command(new)'], deny: ['write_file(*)'], ask: ['view_file(*)'] },
    });
  });

  it('is not listed in managed outputs so stale cleanup never deletes user settings', () => {
    const managed = getTargetLayout('antigravity', 'global')!.managedOutputs!;
    expect(managed.files).not.toContain(ANTIGRAVITY_GLOBAL_SETTINGS_FILE);
    expect(managed.dirs).not.toContain('.gemini/antigravity-cli');
  });
});

describe('antigravity global permissions — import', () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it('imports the three lists into canonical permissions.yaml', async () => {
    writeSettings(
      JSON.stringify(
        { permissions: { allow: ['run_command(npm test)'], deny: ['write_file(*)'], ask: ['*'] } },
        null,
        2,
      ),
    );

    const results = await importFromAntigravity(TEST_DIR, { scope: 'global' });
    const permissions = results.filter((r) => r.feature === 'permissions');
    expect(permissions).toHaveLength(1);
    expect(permissions[0]!.toPath).toBe('.agentsmesh/permissions.yaml');
    const written = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(written).toContain('run_command(npm test)');
    expect(written).toContain('write_file(*)');
  });

  it('preserves comments and unrelated keys in canonical permissions.yaml', async () => {
    mkdirSync(join(TEST_DIR, '.agentsmesh'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'permissions.yaml'),
      '# hand written\nallow:\n  - run_command(old)\nnotes: keep me\n',
    );
    writeSettings(JSON.stringify({ permissions: { allow: ['run_command(new)'] } }, null, 2));

    await importFromAntigravity(TEST_DIR, { scope: 'global' });
    const written = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(written).toContain('# hand written');
    expect(written).toContain('notes: keep me');
    expect(written).toContain('run_command(new)');
    expect(written).not.toContain('run_command(old)');
  });

  it('clears a canonical list the user deleted from settings.json', async () => {
    mkdirSync(join(TEST_DIR, '.agentsmesh'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'permissions.yaml'),
      '# hand written\nallow:\n  - run_command(revoked)\ndeny:\n  - write_file(*)\nnotes: keep me\n',
    );
    writeSettings(JSON.stringify({ permissions: { deny: ['write_file(*)'] } }, null, 2));

    await importFromAntigravity(TEST_DIR, { scope: 'global' });
    const written = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(written).not.toContain('run_command(revoked)');
    expect(written).toContain('allow: []');
    expect(written).toContain('write_file(*)');
    expect(written).toContain('# hand written');
    expect(written).toContain('notes: keep me');
  });

  it('does not invent a list canonical never had', async () => {
    mkdirSync(join(TEST_DIR, '.agentsmesh'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'deny:\n  - write_file(*)\n');
    writeSettings(JSON.stringify({ permissions: { deny: ['write_file(*)'] } }, null, 2));

    await importFromAntigravity(TEST_DIR, { scope: 'global' });
    const written = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(written).not.toContain('allow');
    expect(written).not.toContain('ask');
  });

  it('does not read the global settings file at project scope', async () => {
    writeSettings(JSON.stringify({ permissions: { allow: ['run_command(npm test)'] } }, null, 2));
    const results = await importFromAntigravity(TEST_DIR);
    expect(results.filter((r) => r.feature === 'permissions')).toEqual([]);
  });
});
