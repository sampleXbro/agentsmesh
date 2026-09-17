import { AB_PERMISSIONS } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { CanonicalFiles, ImportResult, Permissions } from '../../../../src/core/types.js';
import {
  generateTraeGlobalPermissions,
  importTraeGlobalPermissions,
  serializeTraePermissions,
} from '../../../../src/targets/trae/global-permissions.js';
import { TRAE_GLOBAL_PERMISSIONS_FILE } from '../../../../src/targets/trae/constants.js';

const FEATURES = new Set(['permissions']);
let root = '';

function setup(files: Record<string, string> = {}): string {
  root = join(tmpdir(), `trae-perms-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  mkdirSync(root, { recursive: true });
  return root;
}

function canonical(permissions: Permissions | null): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions,
    hooks: null,
    ignore: [],
  };
}

function parsed(content: string): Record<string, never> {
  return JSON.parse(content) as Record<string, never>;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('serializeTraePermissions', () => {
  it('creates only the containers it needs, with no invented policy keys', () => {
    const content = serializeTraePermissions(
      { allow: ['Bash(npm run test:*)', 'Read(./docs)'], deny: ['Bash(curl:*)'] },
      null,
    );

    expect(content).not.toBeNull();
    const json = JSON.parse(content!) as Record<string, never>;
    expect(Object.keys(json)).toEqual(['customProfiles', 'resourceAuthorization']);
    expect(json).toEqual({
      customProfiles: {
        defaultCustomProfile: {
          approval: {
            commandRules: {
              prefix: { 'npm run test': { approval: 'allow' }, curl: { approval: 'deny' } },
            },
          },
        },
      },
      resourceAuthorization: { filesystem: { readWrite: [], readOnly: ['./docs'] } },
    });
    expect(content!.endsWith('\n')).toBe(true);
  });

  it('keeps every key of an existing file that agentsmesh does not own', () => {
    const existing = JSON.stringify({
      customProfiles: {
        defaultCustomProfile: {
          displayName: 'mine',
          approval: {
            reviewer: 'agent',
            sceneRules: { shellFileProtection: true },
            commandRules: { regex: { '^ls': { approval: 'allow' } } },
            mcpRules: { 'server/tool': { approval: 'ask' } },
          },
        },
        otherProfile: { displayName: 'other' },
      },
      resourceAuthorization: { network: { allow: ['example.com'], deny: [] } },
      unrelatedTopLevel: true,
    });

    const json = parsed(serializeTraePermissions({ allow: ['Bash(ls:*)'], deny: [] }, existing)!);

    expect(json).toMatchObject({
      customProfiles: {
        defaultCustomProfile: {
          displayName: 'mine',
          approval: {
            reviewer: 'agent',
            sceneRules: { shellFileProtection: true },
            commandRules: {
              regex: { '^ls': { approval: 'allow' } },
              prefix: { ls: { approval: 'allow' } },
            },
            mcpRules: { 'server/tool': { approval: 'ask' } },
          },
        },
        otherProfile: { displayName: 'other' },
      },
      resourceAuthorization: { network: { allow: ['example.com'] } },
      unrelatedTopLevel: true,
    });
  });

  it('preserves extra rule fields such as execEnv on a rule it rewrites', () => {
    const existing = JSON.stringify({
      customProfiles: {
        defaultCustomProfile: {
          approval: { commandRules: { prefix: { ls: { approval: 'deny', execEnv: 'sandbox' } } } },
        },
      },
    });

    const json = parsed(serializeTraePermissions({ allow: ['Bash(ls:*)'], deny: [] }, existing)!);
    expect(json).toMatchObject({
      customProfiles: {
        defaultCustomProfile: {
          approval: {
            commandRules: { prefix: { ls: { approval: 'allow', execEnv: 'sandbox' } } },
          },
        },
      },
    });
  });

  it('keeps a rule and a folder grant that canonical no longer names', () => {
    const existing = JSON.stringify({
      customProfiles: {
        defaultCustomProfile: {
          approval: { commandRules: { prefix: { curl: { approval: 'allow' } } } },
        },
      },
      resourceAuthorization: { filesystem: { readWrite: ['./src'], readOnly: [] } },
    });

    const json = parsed(serializeTraePermissions({ allow: ['Bash(ls:*)'], deny: [] }, existing)!);
    expect(json).toMatchObject({
      customProfiles: {
        defaultCustomProfile: {
          approval: {
            commandRules: { prefix: { curl: { approval: 'allow' }, ls: { approval: 'allow' } } },
          },
        },
      },
      resourceAuthorization: { filesystem: { readWrite: ['./src'], readOnly: [] } },
    });
  });

  it('leaves the file alone when canonical manages or grants nothing', () => {
    expect(serializeTraePermissions(null, null)).toBeNull();
    expect(serializeTraePermissions({ allow: [], deny: [] }, '{"unrelated": 1}')).toBeNull();
  });

  it('starts from a fresh document when the existing file is unparseable', () => {
    const json = parsed(serializeTraePermissions({ allow: ['Bash(ls:*)'], deny: [] }, '{broken')!);
    expect(json).toMatchObject({
      customProfiles: {
        defaultCustomProfile: {
          approval: { commandRules: { prefix: { ls: { approval: 'allow' } } } },
        },
      },
    });
  });
});

describe('generateTraeGlobalPermissions', () => {
  it('emits the global permission file with a created status', async () => {
    const projectRoot = setup();
    const results = await generateTraeGlobalPermissions(
      canonical({ allow: ['Bash(ls:*)'], deny: [] }),
      projectRoot,
      FEATURES,
    );

    expect(results).toHaveLength(1);
    expect(results[0].target).toBe('trae');
    expect(results[0].path).toBe(TRAE_GLOBAL_PERMISSIONS_FILE);
    expect(results[0].status).toBe('created');
  });

  it('emits nothing when the permissions feature is off', async () => {
    const projectRoot = setup();
    const results = await generateTraeGlobalPermissions(
      canonical({ allow: ['Bash(ls:*)'], deny: [] }),
      projectRoot,
      new Set(['rules']),
    );
    expect(results).toHaveLength(0);
  });

  it('emits nothing when there is nothing to write or clear', async () => {
    const projectRoot = setup();
    expect(await generateTraeGlobalPermissions(canonical(null), projectRoot, FEATURES)).toEqual([]);
  });
});

describe('importTraeGlobalPermissions', () => {
  it('writes the Trae rules into canonical permissions', async () => {
    const projectRoot = setup({
      [TRAE_GLOBAL_PERMISSIONS_FILE]: JSON.stringify({
        customProfiles: {
          defaultCustomProfile: {
            approval: { commandRules: { prefix: { 'npm test': { approval: 'allow' } } } },
          },
        },
        resourceAuthorization: { filesystem: { readOnly: ['./docs'] } },
      }),
    });
    const results: ImportResult[] = [];

    await importTraeGlobalPermissions(projectRoot, results);

    expect(results).toEqual([
      {
        fromTool: 'trae',
        fromPath: join(projectRoot, TRAE_GLOBAL_PERMISSIONS_FILE),
        toPath: AB_PERMISSIONS,
        feature: 'permissions',
      },
    ]);
    const canonicalFile = readFileSync(join(projectRoot, AB_PERMISSIONS), 'utf-8');
    expect(parseYaml(canonicalFile)).toEqual({
      allow: ['Bash(npm test:*)', 'Read(./docs)'],
      deny: [],
    });
  });

  it('keeps canonical entries Trae cannot express, plus comments and ask', async () => {
    const projectRoot = setup({
      [TRAE_GLOBAL_PERMISSIONS_FILE]: JSON.stringify({
        customProfiles: {
          defaultCustomProfile: {
            approval: { commandRules: { prefix: { ls: { approval: 'allow' } } } },
          },
        },
      }),
      [AB_PERMISSIONS]:
        '# my rules\nallow:\n  - Grep\n  - Bash(old:*)\ndeny:\n  - Read(./.env)\nask:\n  - WebFetch\n',
    });

    await importTraeGlobalPermissions(projectRoot, []);

    const raw = readFileSync(join(projectRoot, AB_PERMISSIONS), 'utf-8');
    expect(raw).toContain('# my rules');
    expect(parseYaml(raw)).toEqual({
      allow: ['Bash(ls:*)', 'Grep'],
      deny: ['Read(./.env)'],
      ask: ['WebFetch'],
    });
  });

  it('does nothing when the file is missing, unparseable or expresses nothing', async () => {
    const results: ImportResult[] = [];
    await importTraeGlobalPermissions(setup(), results);
    rmSync(root, { recursive: true, force: true });

    await importTraeGlobalPermissions(
      setup({ [TRAE_GLOBAL_PERMISSIONS_FILE]: '{broken' }),
      results,
    );
    rmSync(root, { recursive: true, force: true });

    await importTraeGlobalPermissions(setup({ [TRAE_GLOBAL_PERMISSIONS_FILE]: '{}' }), results);
    expect(results).toHaveLength(0);
  });

  it('keeps the canonical Write() spelling that Trae flattens into readWrite', async () => {
    const projectRoot = setup({
      [TRAE_GLOBAL_PERMISSIONS_FILE]: JSON.stringify({
        resourceAuthorization: { filesystem: { readWrite: ['./src', './tmp'] } },
      }),
      [AB_PERMISSIONS]: 'allow:\n  - Write(./src)\ndeny: []\n',
    });

    await importTraeGlobalPermissions(projectRoot, []);

    expect(parseYaml(readFileSync(join(projectRoot, AB_PERMISSIONS), 'utf-8'))).toEqual({
      allow: ['Write(./src)', 'Edit(./tmp)'],
      deny: [],
    });
  });

  it('starts from a fresh canonical file when the existing one is not a YAML map', async () => {
    const projectRoot = setup({
      [TRAE_GLOBAL_PERMISSIONS_FILE]: JSON.stringify({
        customProfiles: {
          defaultCustomProfile: {
            approval: { commandRules: { exact: { ls: { approval: 'allow' } } } },
          },
        },
      }),
      [AB_PERMISSIONS]: 'allow: [broken\n',
    });

    await importTraeGlobalPermissions(projectRoot, []);

    expect(parseYaml(readFileSync(join(projectRoot, AB_PERMISSIONS), 'utf-8'))).toEqual({
      allow: ['Bash(ls)'],
      deny: [],
    });
  });

  it('round-trips generate -> write -> import -> generate', async () => {
    const permissions: Permissions = {
      allow: ['Bash(npm run test:*)', 'Bash(git status)', 'Read(./docs)', 'Edit(./src)'],
      deny: ['Bash(curl:*)'],
      ask: ['Bash(git push:*)'],
    };
    const first = serializeTraePermissions(permissions, null)!;
    const projectRoot = setup({ [TRAE_GLOBAL_PERMISSIONS_FILE]: first });

    await importTraeGlobalPermissions(projectRoot, []);
    const reimported = parseYaml(
      readFileSync(join(projectRoot, AB_PERMISSIONS), 'utf-8'),
    ) as Permissions;

    expect(serializeTraePermissions(reimported, first)).toBe(first);
  });
});
