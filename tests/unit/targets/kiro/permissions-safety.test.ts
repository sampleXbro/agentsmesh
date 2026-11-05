import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  ruleToCanonicalEntries,
  toKiroRule,
} from '../../../../src/targets/kiro/permissions-format.js';
import { isOwnedKiroRule } from '../../../../src/targets/kiro/permissions-lists.js';
import { buildKiroPermissionsYaml } from '../../../../src/targets/kiro/permissions-generate.js';
import { importFromKiro } from '../../../../src/targets/kiro/importer.js';
import { lintPermissions } from '../../../../src/targets/kiro/lint.js';
import {
  KIRO_AGENTS_DIR,
  KIRO_GLOBAL_PERMISSIONS_FILE,
} from '../../../../src/targets/kiro/constants.js';

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

function agent(name: string): CanonicalFiles['agents'][number] {
  return {
    source: `/proj/.agentsmesh/agents/${name}.md`,
    name,
    description: `${name} agent`,
    tools: ['Read'],
    model: '',
    body: `You are ${name}.`,
  };
}

const HAND_WRITTEN = [
  '# user permissions',
  'defaultEffect: ask',
  'rules:',
  '  # never touch secrets',
  '  - capability: fs_write',
  "    match: ['**']",
  "    exclude: ['.env', 'secrets/**']",
  '    effect: allow',
  '  - capability: mcp',
  '    effect: ask',
  '  - capability: fs_read',
  '    effect: allow',
  '',
].join('\n');

describe('isOwnedKiroRule — only the exact shape agentsmesh emits', () => {
  it('owns a rule agentsmesh could have written', () => {
    expect(isOwnedKiroRule({ capability: 'fs_read', effect: 'allow' })).toBe(true);
    expect(isOwnedKiroRule({ capability: 'shell', match: ['npm *'], effect: 'deny' })).toBe(true);
  });

  it('leaves a rule carrying exclude, an extra key or an unmappable capability to the user', () => {
    expect(
      isOwnedKiroRule({
        capability: 'fs_write',
        match: ['**'],
        exclude: ['.env'],
        effect: 'allow',
      }),
    ).toBe(false);
    expect(isOwnedKiroRule({ capability: 'fs_read', effect: 'allow', priority: 1 })).toBe(false);
    expect(isOwnedKiroRule({ capability: 'mcp', effect: 'ask' })).toBe(false);
    expect(isOwnedKiroRule({ capability: 'web_fetch', match: ['x'], effect: 'allow' })).toBe(false);
    expect(isOwnedKiroRule('not-a-rule')).toBe(false);
    expect(isOwnedKiroRule({ capability: 'fs_read', effect: 'maybe' })).toBe(false);
  });
});

describe('buildKiroPermissionsYaml — hand-written rules survive a regenerate', () => {
  it('keeps every rule agentsmesh cannot express, including exclude protections', () => {
    const content = buildKiroPermissionsYaml({ allow: ['Grep'], deny: [] }, HAND_WRITTEN)!;
    const parsed = parseYaml(content) as { defaultEffect: string; rules: unknown[] };
    expect(parsed.defaultEffect).toBe('ask');
    expect(parsed.rules).toEqual([
      {
        capability: 'fs_write',
        match: ['**'],
        exclude: ['.env', 'secrets/**'],
        effect: 'allow',
      },
      { capability: 'mcp', effect: 'ask' },
      { capability: 'fs_read', effect: 'allow' },
    ]);
    expect(content).toContain('# never touch secrets');
    expect(content).toContain('# user permissions');
  });

  it('still clears the owned rules when canonical revokes them', () => {
    const content = buildKiroPermissionsYaml({ allow: [], deny: [] }, HAND_WRITTEN)!;
    const parsed = parseYaml(content) as { rules: unknown[] };
    expect(parsed.rules).toEqual([
      {
        capability: 'fs_write',
        match: ['**'],
        exclude: ['.env', 'secrets/**'],
        effect: 'allow',
      },
      { capability: 'mcp', effect: 'ask' },
    ]);
  });

  it('leaves the file alone when no permissions.yaml list is managed', () => {
    expect(buildKiroPermissionsYaml(null, HAND_WRITTEN)).toBeNull();
  });

  it('keeps the rules of an effect permissions.yaml does not manage', () => {
    const content = buildKiroPermissionsYaml({ deny: ['Bash(rm:*)'] }, HAND_WRITTEN)!;
    expect((parseYaml(content) as { rules: unknown[] }).rules).toEqual([
      {
        capability: 'fs_write',
        match: ['**'],
        exclude: ['.env', 'secrets/**'],
        effect: 'allow',
      },
      { capability: 'mcp', effect: 'ask' },
      { capability: 'fs_read', effect: 'allow' },
      { capability: 'shell', match: ['rm*'], effect: 'deny' },
    ]);
  });

  it('leaves an unparsable or non-map permissions file completely alone', () => {
    expect(buildKiroPermissionsYaml({ allow: ['Read'], deny: [] }, '\tnot: [valid')).toBeNull();
    expect(buildKiroPermissionsYaml({ allow: ['Read'], deny: [] }, '- a\n- b\n')).toBeNull();
  });

  it('writes into an empty file and over a `rules` key that is not a list', () => {
    expect(parseYaml(buildKiroPermissionsYaml({ allow: ['Read'], deny: [] }, '')!)).toEqual({
      rules: [{ capability: 'fs_read', effect: 'allow' }],
    });
    expect(
      parseYaml(buildKiroPermissionsYaml({ allow: ['Read'], deny: [] }, 'rules: nope\n')!),
    ).toEqual({ rules: [{ capability: 'fs_read', effect: 'allow' }] });
  });
});

describe('shell pattern round-trip is exact', () => {
  it("keeps the space boundary of the docs' own `npm *` example", () => {
    const entries = ruleToCanonicalEntries({
      capability: 'shell',
      match: ['npm *'],
      effect: 'allow',
    });
    expect(entries).toEqual(['Bash(npm :*)']);
    expect(toKiroRule(entries[0]!, 'allow')).toEqual({
      capability: 'shell',
      match: ['npm *'],
      effect: 'allow',
    });
  });

  it('never widens a trailing-space canonical prefix on the way out', () => {
    expect(toKiroRule('Bash(git push :*)', 'deny')).toEqual({
      capability: 'shell',
      match: ['git push *'],
      effect: 'deny',
    });
  });
});

describe('importFromKiro — canonical is never wiped by an empty or partial rule set', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kiro-safety-'));
    mkdirSync(join(dir, '.agentsmesh'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const CANONICAL = [
    'allow: [Read, Grep, LS]',
    "deny: [WebFetch, 'Bash(curl:*)', 'Read(./.env)']",
    '',
  ].join('\n');

  function writeGlobalPermissions(body: string): void {
    mkdirSync(join(dir, '.kiro/settings'), { recursive: true });
    writeFileSync(join(dir, KIRO_GLOBAL_PERMISSIONS_FILE), body);
  }

  function writeAgent(name: string, body: string): void {
    mkdirSync(join(dir, KIRO_AGENTS_DIR), { recursive: true });
    writeFileSync(join(dir, `${KIRO_AGENTS_DIR}/${name}.md`), body);
  }

  function readCanonicalPermissions(): Record<string, unknown> {
    return parseYaml(readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
  }

  it('ignores a `rules: []` file — the very file revocation writes', async () => {
    writeFileSync(join(dir, '.agentsmesh/permissions.yaml'), CANONICAL);
    writeGlobalPermissions('rules: []\n');
    const results = await importFromKiro(dir, { scope: 'global' });
    expect(results.find((r) => r.feature === 'permissions')).toBeUndefined();
    expect(readCanonicalPermissions()).toEqual({
      allow: ['Read', 'Grep', 'LS'],
      deny: ['WebFetch', 'Bash(curl:*)', 'Read(./.env)'],
    });
  });

  it('leaves the deny list alone when the file carries no deny rule', async () => {
    writeFileSync(join(dir, '.agentsmesh/permissions.yaml'), CANONICAL);
    writeGlobalPermissions('rules:\n  - capability: fs_read\n    effect: allow\n');
    await importFromKiro(dir, { scope: 'global' });
    expect(readCanonicalPermissions().deny).toEqual(['WebFetch', 'Bash(curl:*)', 'Read(./.env)']);
  });

  it('ignores an unparsable permissions.yaml instead of clearing canonical', async () => {
    writeFileSync(join(dir, '.agentsmesh/permissions.yaml'), CANONICAL);
    writeGlobalPermissions('rules:\n  - [unclosed\n');
    const results = await importFromKiro(dir, { scope: 'global' });
    expect(results.find((r) => r.feature === 'permissions')).toBeUndefined();
    expect(readCanonicalPermissions().allow).toEqual(['Read', 'Grep', 'LS']);
  });

  it('keeps the comments written inside a canonical list', async () => {
    writeFileSync(
      join(dir, '.agentsmesh/permissions.yaml'),
      '# top\nallow:\n  # safe reads\n  - Grep # ripgrep only\n  - 7\n  - {a: 1}\ndeny: []\n',
    );
    writeGlobalPermissions('rules:\n  - capability: fs_read\n    effect: allow\n');
    await importFromKiro(dir, { scope: 'global' });
    const raw = readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8');
    expect(raw).toContain('# safe reads');
    expect(raw).toContain('# ripgrep only');
    expect(readCanonicalPermissions().allow).toEqual(['Grep']);
  });

  it('unions denies and intersects allows across disagreeing agent profiles', async () => {
    writeAgent(
      'code-reviewer',
      '---\nname: code-reviewer\ndescription: r\npermissions:\n  rules:\n' +
        '    - capability: fs_read\n      effect: allow\n' +
        '    - capability: shell\n      effect: deny\n---\n\nR.\n',
    );
    writeAgent(
      'researcher',
      '---\nname: researcher\ndescription: s\npermissions:\n  rules:\n' +
        '    - capability: fs_read\n      effect: allow\n' +
        '    - capability: shell\n      effect: allow\n' +
        '    - capability: web_fetch\n      effect: allow\n---\n\nS.\n',
    );
    await importFromKiro(dir, { scope: 'project' });
    expect(readCanonicalPermissions()).toEqual({ allow: ['Read'], deny: ['Bash'] });
  });
});

describe('lintPermissions (kiro) — project scope with no agent profile', () => {
  it('says permissions are not emitted at all when canonical has no agents', () => {
    const diags = lintPermissions(canonical({ permissions: { allow: ['Read'], deny: [] } }));
    expect(diags.some((d) => d.message.includes('no agent profiles'))).toBe(true);
  });

  it('names the per-agent flattening when agents exist', () => {
    const diags = lintPermissions(
      canonical({ agents: [agent('code-reviewer')], permissions: { allow: ['Read'], deny: [] } }),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('every');
    expect(diags[0]!.message).toContain(KIRO_AGENTS_DIR);
  });
});
