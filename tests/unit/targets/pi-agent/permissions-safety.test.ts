import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { mergePiSettings } from '../../../../src/targets/pi-agent/permissions-format.js';
import { generatePermissions } from '../../../../src/targets/pi-agent/generator.js';
import { importFromPiAgent } from '../../../../src/targets/pi-agent/importer.js';
import { lintPermissions } from '../../../../src/targets/pi-agent/lint.js';
import { descriptor } from '../../../../src/targets/pi-agent/index.js';
import { PI_AGENT_SETTINGS_FILE } from '../../../../src/targets/pi-agent/constants.js';

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

/** The overwhelmingly common shape: Claude-style scoped entries, no bare tool name. */
const SCOPED_ONLY = {
  allow: ['Bash(npm run test:*)', 'Read(src/**)'],
  deny: ['Bash(rm:*)'],
};

describe('generatePermissions — only a managed allow list writes defaultTools', () => {
  it('emits nothing when allow is unmanaged, so the user defaultTools stay', () => {
    expect(generatePermissions(canonical())).toEqual([]);
    expect(generatePermissions(canonical({ permissions: { deny: ['Bash(rm:*)'] } }))).toEqual([]);
    expect(generatePermissions(canonical({ permissions: { ask: ['Write'] } }))).toEqual([]);
  });

  it('writes an empty defaultTools for a managed empty allow list', () => {
    expect(generatePermissions(canonical({ permissions: { allow: [] } }))).toEqual([
      { path: PI_AGENT_SETTINGS_FILE, content: JSON.stringify({ defaultTools: [] }, null, 2) },
    ]);
  });
});

describe('generatePermissions — an empty projection is written, never deleted', () => {
  it('writes an explicit empty allow-list rather than clearing the key', () => {
    const outputs = generatePermissions(canonical({ permissions: SCOPED_ONLY }));
    expect(JSON.parse(outputs[0]!.content)).toEqual({ defaultTools: [] });
  });

  it('never re-enables the built-ins a user had switched off', () => {
    const merged = descriptor.mergeGeneratedOutputContent!(
      JSON.stringify({ model: 'gpt-5', defaultTools: ['read', 'grep', 'ls'], theme: 'dark' }),
      undefined,
      generatePermissions(canonical({ permissions: SCOPED_ONLY }))[0]!.content,
      PI_AGENT_SETTINGS_FILE,
    );
    expect(JSON.parse(merged!)).toEqual({ model: 'gpt-5', theme: 'dark', defaultTools: [] });
  });

  it('keeps the merge idempotent for built-ins agentsmesh does not own', () => {
    const merged = mergePiSettings(
      JSON.stringify({ defaultTools: ['read', 'powershell'] }),
      JSON.stringify({ defaultTools: ['read', 'powershell'] }),
    );
    expect(JSON.parse(merged)).toEqual({ defaultTools: ['read', 'powershell'] });
  });
});

describe('lintPermissions (pi-agent) — the empty projection is named', () => {
  it('warns that every built-in is switched off when nothing maps', () => {
    const diags = lintPermissions(canonical({ permissions: SCOPED_ONLY }));
    const messages = diags.map((d) => d.message).join('\n');
    expect(diags).toHaveLength(3);
    expect(messages).toContain('read, bash, powershell, edit, write, grep, find, ls');
  });
});

describe('importFromPiAgent — an empty defaultTools never wipes canonical', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pi-safety-import-'));
    mkdirSync(join(dir, '.agentsmesh'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function readCanonicalPermissions(): Record<string, unknown> {
    return parseYaml(readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
  }

  it('ignores the `defaultTools: []` file that generation itself writes', async () => {
    writeFileSync(
      join(dir, '.agentsmesh/permissions.yaml'),
      'allow: [Read, Grep]\ndeny: [WebFetch]\n',
    );
    mkdirSync(join(dir, '.pi'), { recursive: true });
    writeFileSync(join(dir, PI_AGENT_SETTINGS_FILE), JSON.stringify({ defaultTools: [] }));
    const results = await importFromPiAgent(dir, { scope: 'project' });
    expect(results.find((r) => r.feature === 'permissions')).toBeUndefined();
    expect(readCanonicalPermissions()).toEqual({ allow: ['Read', 'Grep'], deny: ['WebFetch'] });
  });

  it('keeps the comments written inside the canonical allow list', async () => {
    writeFileSync(
      join(dir, '.agentsmesh/permissions.yaml'),
      '# top\nallow:\n  # safe reads\n  - Grep # ripgrep only\n  - 7\n  - {a: 1}\ndeny: []\n',
    );
    mkdirSync(join(dir, '.pi'), { recursive: true });
    writeFileSync(join(dir, PI_AGENT_SETTINGS_FILE), JSON.stringify({ defaultTools: ['grep'] }));
    await importFromPiAgent(dir, { scope: 'project' });
    const raw = readFileSync(join(dir, '.agentsmesh/permissions.yaml'), 'utf-8');
    expect(raw).toContain('# safe reads');
    expect(raw).toContain('# ripgrep only');
  });
});
