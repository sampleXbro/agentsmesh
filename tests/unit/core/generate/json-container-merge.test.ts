/**
 * `mergeJsonContainer` spreads the generated sub-keys of one container over the
 * user's: a sub-key the generated content leaves out (an unmanaged permission
 * list) keeps the user's value.
 */

import { describe, expect, it } from 'vitest';
import {
  jsonContainerMerger,
  mergeJsonContainer,
} from '../../../../src/core/generate/json-owned-keys.js';

describe('mergeJsonContainer', () => {
  it('replaces the generated sub-keys and keeps every other key', () => {
    const base = JSON.stringify({
      model: 'mine',
      permissions: { allow: ['Old'], deny: ['Bash(rm)'], mode: 'strict' },
    });
    const generated = JSON.stringify({ permissions: { allow: ['Read'] } });

    expect(JSON.parse(mergeJsonContainer(base, generated, 'permissions')!)).toEqual({
      model: 'mine',
      permissions: { allow: ['Read'], deny: ['Bash(rm)'], mode: 'strict' },
    });
  });

  it('writes an empty generated list over the user list', () => {
    const base = JSON.stringify({ permissions: { allow: ['Old'], deny: ['Bash(rm)'] } });
    const generated = JSON.stringify({ permissions: { allow: [] } });

    expect(JSON.parse(mergeJsonContainer(base, generated, 'permissions')!)).toEqual({
      permissions: { allow: [], deny: ['Bash(rm)'] },
    });
  });

  it('returns null with no base, so the generated file is written as is', () => {
    expect(mergeJsonContainer(null, '{"permissions":{}}', 'permissions')).toBeNull();
    expect(mergeJsonContainer('  ', '{"permissions":{}}', 'permissions')).toBeNull();
  });

  it('keeps a base it cannot parse byte for byte', () => {
    const base = '{ // comment\n "permissions": {} }';
    expect(mergeJsonContainer(base, '{"permissions":{"allow":[]}}', 'permissions')).toBe(base);
  });
});

describe('jsonContainerMerger', () => {
  it('claims only its paths', () => {
    const merge = jsonContainerMerger(['.tool/cli.json'], 'permissions');
    const base = '{"permissions":{"deny":["x"]}}';
    const generated = '{"permissions":{"allow":["y"]}}';

    expect(merge(base, undefined, generated, '.tool/other.json')).toBeNull();
    expect(JSON.parse(merge(base, undefined, generated, '.tool/cli.json')!)).toEqual({
      permissions: { deny: ['x'], allow: ['y'] },
    });
  });

  it('merges into a pending write before the file on disk', () => {
    const merge = jsonContainerMerger(['.tool/cli.json'], 'permissions');
    const pending = { content: '{"permissions":{"deny":["pending"]}}' } as never;

    expect(
      JSON.parse(
        merge(
          '{"permissions":{"deny":["disk"]}}',
          pending,
          '{"permissions":{}}',
          '.tool/cli.json',
        )!,
      ),
    ).toEqual({ permissions: { deny: ['pending'] } });
  });
});
