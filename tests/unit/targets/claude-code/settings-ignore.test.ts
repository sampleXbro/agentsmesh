import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { generateIgnore } from '../../../../src/targets/claude-code/generator.js';
import { mergeClaudeSettingsIgnore } from '../../../../src/targets/claude-code/settings-ignore-merge.js';
import { importFromClaudeCode } from '../../../../src/targets/claude-code/importer.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'claude-ignore-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
const canonical = (ignore: string[]): CanonicalFiles => ({
  rules: [], commands: [], agents: [], skills: [], mcp: null,
  permissions: null, hooks: null, ignore,
});

describe('Claude Code real ignore mechanism', () => {
  it('emits Read denies into settings rather than an inert .claudeignore file', () => {
    const outputs = generateIgnore(canonical(['.env', 'secrets/', '!secrets/README.md']));
    expect(outputs.map(x => x.path)).toEqual(['.claude/settings.json']);
    expect(JSON.parse(outputs[0]!.content)).toEqual({
      permissions: { deny: ['Read(./.env)', 'Read(./secrets/**)'] },
    });
  });

  it('merges ignore rules with unrelated settings and pending explicit permissions', () => {
    const prior = JSON.stringify({ model: 'sonnet', permissions: { allow: ['Read'], deny: ['Bash(rm *)'] } });
    const overlay = generateIgnore(canonical(['.env']))[0]!.content;
    const merged = mergeClaudeSettingsIgnore(prior, undefined, overlay, '.claude/settings.json');
    expect(JSON.parse(merged!)).toEqual({
      model: 'sonnet',
      permissions: { allow: ['Read'], deny: ['Bash(rm *)', 'Read(./.env)'], ask: [] },
    });
  });

  it('imports Read deny patterns back as canonical ignore without dropping permissions', async () => {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({
      permissions: { deny: ['Read(./.env)', 'Read(./secrets/**)', 'Bash(rm *)'] },
    }));
    const results = await importFromClaudeCode(root);
    expect(results.some(x => x.feature === 'ignore')).toBe(true);
    expect(readFileSync(join(root, '.agentsmesh/ignore'), 'utf8')).toContain('secrets/');
    expect(readFileSync(join(root, '.agentsmesh/permissions.yaml'), 'utf8')).toContain('Bash(rm *)');
  });
});
