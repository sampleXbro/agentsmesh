import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeSettingsInto, writeSettingsInto } from '../../../src/install/pack/copy-entities.js';
import { emptyCanonical } from '../../../src/canonical/load/empty-canonical.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

let packDir = '';

const server = (command: string): object => ({ type: 'stdio', command, args: [], env: {} });

function settings(overrides: Partial<CanonicalFiles>): CanonicalFiles {
  return { ...emptyCanonical(), ...overrides };
}

const ALPHA = settings({
  mcp: { mcpServers: { shared: server('alpha') as never, alpha: server('alpha') as never } },
  permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
  hooks: { PreToolUse: [{ matcher: 'Bash', command: 'echo alpha' }] },
  ignore: ['dist'],
});

function read(file: string): string {
  return readFileSync(join(packDir, file), 'utf8');
}

beforeEach(() => {
  packDir = mkdtempSync(join(tmpdir(), 'am-pack-merge-settings-'));
});

afterEach(() => {
  rmSync(packDir, { recursive: true, force: true });
});

describe('mergeSettingsInto', () => {
  it('adds new settings to the pack settings; a same-name server takes the new value', async () => {
    await writeSettingsInto(ALPHA, packDir);

    await mergeSettingsInto(
      settings({
        mcp: { mcpServers: { shared: server('beta') as never, beta: server('beta') as never } },
        permissions: { allow: ['Read', 'Write'], ask: ['WebFetch'] },
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', command: 'echo alpha' },
            { matcher: 'Bash', command: 'echo beta' },
          ],
          Stop: [{ matcher: '*', command: 'echo stop' }],
        },
        ignore: ['dist', 'coverage'],
      }),
      packDir,
    );

    expect(JSON.parse(read('mcp.json'))).toEqual({
      mcpServers: { shared: server('beta'), alpha: server('alpha'), beta: server('beta') },
    });
    expect(read('permissions.yaml')).toBe(
      'allow:\n  - Read\n  - Write\ndeny:\n  - Bash(rm:*)\nask:\n  - WebFetch\n',
    );
    expect(read('hooks.yaml')).toBe(
      'PreToolUse:\n' +
        '  - matcher: Bash\n    command: echo alpha\n' +
        '  - matcher: Bash\n    command: echo beta\n' +
        'Stop:\n  - matcher: "*"\n    command: echo stop\n',
    );
    expect(read('ignore')).toBe('dist\ncoverage\n');
  });

  it('keeps the pack settings when the new install brings none', async () => {
    await writeSettingsInto(ALPHA, packDir);
    const before = ['mcp.json', 'permissions.yaml', 'hooks.yaml', 'ignore'].map(read);

    await mergeSettingsInto(emptyCanonical(), packDir);

    expect(['mcp.json', 'permissions.yaml', 'hooks.yaml', 'ignore'].map(read)).toEqual(before);
  });

  it('writes the new settings into a pack that has none', async () => {
    await mergeSettingsInto(ALPHA, packDir);

    expect(readdirSync(packDir).sort()).toEqual([
      'hooks.yaml',
      'ignore',
      'mcp.json',
      'permissions.yaml',
    ]);
    expect(JSON.parse(read('mcp.json'))).toEqual({
      mcpServers: { shared: server('alpha'), alpha: server('alpha') },
    });
  });

  it('writes no settings file when neither side has settings', async () => {
    await mergeSettingsInto(emptyCanonical(), packDir);

    expect(readdirSync(packDir)).toEqual([]);
  });
});
