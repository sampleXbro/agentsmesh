import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { kimiCodeScopeExtras } from '../../../../src/targets/kimi-code/scope-extras.js';
import { KIMI_CODE_GLOBAL_CONFIG_FILE } from '../../../../src/targets/kimi-code/constants.js';
import { makeCanonical } from './fixtures.js';

let dir = '';

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function newHome(existingConfig?: string): string {
  dir = mkdtempSync(join(tmpdir(), 'kimi-scope-'));
  if (existingConfig !== undefined) {
    mkdirSync(join(dir, '.kimi-code'), { recursive: true });
    writeFileSync(join(dir, KIMI_CODE_GLOBAL_CONFIG_FILE), existingConfig);
  }
  return dir;
}

const canonical = makeCanonical({
  hooks: { PostToolUse: [{ matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' }] },
  permissions: { allow: ['Read'], deny: ['WebFetch'], ask: [] },
});

const ALL = new Set(['rules', 'hooks', 'permissions', 'mcp']);

describe('kimiCodeScopeExtras', () => {
  it('writes nothing at project scope: there is no project config.toml', async () => {
    const home = newHome();
    expect(await kimiCodeScopeExtras(canonical, home, 'project', ALL)).toEqual([]);
  });

  it('emits hooks and permissions as ONE config.toml result', async () => {
    const home = newHome();
    const results = await kimiCodeScopeExtras(canonical, home, 'global', ALL);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(KIMI_CODE_GLOBAL_CONFIG_FILE);
    expect(results[0]!.status).toBe('created');
    const parsed = parseToml(results[0]!.content) as Record<string, unknown>;
    expect(parsed.hooks).toEqual([
      { event: 'PostToolUse', matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' },
    ]);
    expect(parsed.permission).toEqual({
      rules: [
        { decision: 'allow', pattern: 'Read' },
        { decision: 'deny', pattern: 'WebFetch' },
      ],
    });
  });

  it('keeps provider credentials that are already on disk', async () => {
    const home = newHome('[providers.kimi]\ntype = "kimi"\napi_key = "sk-live"\n');
    const results = await kimiCodeScopeExtras(canonical, home, 'global', ALL);
    const parsed = parseToml(results[0]!.content) as Record<string, unknown>;
    expect(parsed.providers).toEqual({ kimi: { type: 'kimi', api_key: 'sk-live' } });
    expect(results[0]!.status).toBe('updated');
    expect(results[0]!.currentContent).toContain('sk-live');
  });

  it('touches only the keys whose feature is enabled', async () => {
    const home = newHome();
    const results = await kimiCodeScopeExtras(canonical, home, 'global', new Set(['hooks']));
    const parsed = parseToml(results[0]!.content) as Record<string, unknown>;
    expect(parsed.hooks).toBeDefined();
    expect(parsed.permission).toBeUndefined();
  });

  it('emits nothing when both features are disabled', async () => {
    const home = newHome();
    expect(await kimiCodeScopeExtras(canonical, home, 'global', new Set(['rules']))).toEqual([]);
  });

  it('emits nothing when canonical has nothing and the file has no owned key', async () => {
    const home = newHome('[providers.kimi]\ntype = "kimi"\n');
    expect(await kimiCodeScopeExtras(makeCanonical(), home, 'global', ALL)).toEqual([]);
  });
});

describe('kimiCodeScopeExtras unmanaged permission lists', () => {
  const userRules = [
    '[[permission.rules]]',
    'decision = "allow"',
    'pattern = "Old"',
    '',
    '[[permission.rules]]',
    'decision = "deny"',
    'pattern = "Bash(rm *)"',
    'reason = "mine"',
    '',
    '[[permission.rules]]',
    'decision = "ask"',
    'pattern = "Write"',
    '',
  ].join('\n');

  it('leaves the user rules alone when no permissions.yaml list is managed', async () => {
    const home = newHome(userRules);
    expect(await kimiCodeScopeExtras(makeCanonical(), home, 'global', ALL)).toEqual([]);
  });

  it('keeps the user rules of every decision permissions.yaml does not manage', async () => {
    const home = newHome(userRules);
    const managedAllow = makeCanonical({ permissions: { allow: ['Read'] } });

    const results = await kimiCodeScopeExtras(managedAllow, home, 'global', ALL);

    expect(results.map((result) => result.path)).toEqual([KIMI_CODE_GLOBAL_CONFIG_FILE]);
    expect(parseToml(results[0]!.content)).toEqual({
      permission: {
        rules: [
          { decision: 'allow', pattern: 'Read' },
          { decision: 'deny', pattern: 'Bash(rm *)', reason: 'mine' },
          { decision: 'ask', pattern: 'Write' },
        ],
      },
    });
  });

  it('clears the rules of a managed empty list and keeps the rest', async () => {
    const home = newHome(userRules);
    const managedEmptyDeny = makeCanonical({ permissions: { deny: [] } });

    const results = await kimiCodeScopeExtras(managedEmptyDeny, home, 'global', ALL);

    expect(parseToml(results[0]!.content)).toEqual({
      permission: {
        rules: [
          { decision: 'allow', pattern: 'Old' },
          { decision: 'ask', pattern: 'Write' },
        ],
      },
    });
  });
});
