/**
 * Goose's `PermissionConfig` has no serde defaults: a `user` block missing any
 * of its three lists makes Goose refuse to start. So a managed empty list is
 * written as `[]`, never dropped, and the descriptor merge replaces the whole
 * `user` block on disk.
 */

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { serializeGoosePermissions } from '../../../../src/targets/goose/permissions.js';
import { mergeGooseMcpContent } from '../../../../src/targets/goose/mcp-settings.js';
import { GOOSE_GLOBAL_PERMISSIONS } from '../../../../src/targets/goose/constants.js';

const ON_DISK = [
  '# my goose permissions',
  'smart_approve:',
  '  always_allow:',
  '    - cached__tool',
  '  ask_before: []',
  '  never_allow: []',
  'user:',
  '  always_allow:',
  '    - developer__shell',
  '  ask_before:',
  '    - memory__remember',
  '  never_allow:',
  '    - developer__rm',
  '',
].join('\n');

const EMPTY_USER = ['user:', '  always_allow: []', '  ask_before: []', '  never_allow: []'];

function mergeOnDisk(generated: string): string | null {
  return mergeGooseMcpContent(ON_DISK, undefined, generated, GOOSE_GLOBAL_PERMISSIONS);
}

describe('serializeGoosePermissions — empty managed lists', () => {
  it('writes every list goose requires, even the empty ones', () => {
    expect(serializeGoosePermissions({ allow: ['developer__shell'] }, null)).toBe(
      'user:\n  always_allow:\n    - developer__shell\n  ask_before: []\n  never_allow: []\n',
    );
  });

  it('clears every managed list when all are empty', () => {
    const generated = serializeGoosePermissions({ allow: [], deny: [], ask: [] }, ON_DISK);
    expect(parseYaml(generated!)).toEqual({
      smart_approve: { always_allow: ['cached__tool'], ask_before: [], never_allow: [] },
      user: { always_allow: [], ask_before: [], never_allow: [] },
    });
  });

  it('adds no user category when every list is empty and the file has none', () => {
    const existing = 'smart_approve:\n  always_allow:\n    - cached__tool\n';
    const generated = serializeGoosePermissions({ allow: [], deny: [], ask: [] }, existing);
    expect(parseYaml(generated!)).toEqual({ smart_approve: { always_allow: ['cached__tool'] } });
  });
});

describe('mergeGooseMcpContent — empty managed lists on disk', () => {
  it('clears the user lists and keeps smart_approve and comments', () => {
    const generated = serializeGoosePermissions({ allow: [], deny: [], ask: [] }, ON_DISK)!;
    expect(mergeOnDisk(generated)).toBe(
      [...ON_DISK.split('\n').slice(0, 6), ...EMPTY_USER, ''].join('\n'),
    );
  });

  it('clears only the managed empty list and keeps the unmanaged ones', () => {
    const generated = serializeGoosePermissions({ deny: [] }, ON_DISK)!;
    expect(parseYaml(mergeOnDisk(generated)!)).toEqual({
      smart_approve: { always_allow: ['cached__tool'], ask_before: [], never_allow: [] },
      user: {
        always_allow: ['developer__shell'],
        ask_before: ['memory__remember'],
        never_allow: [],
      },
    });
  });
});
