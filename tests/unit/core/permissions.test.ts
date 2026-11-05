import { describe, expect, it } from 'vitest';
import { managedLists, permissionEntries } from '../../../src/core/permissions.js';

describe('managedLists', () => {
  it('returns only the managed lists among the ones a tool reads', () => {
    expect(managedLists({ allow: ['Read'], ask: [] }, ['allow', 'deny'])).toEqual({
      allow: ['Read'],
    });
  });

  it('keeps an explicit empty list, since it is managed', () => {
    expect(managedLists({ deny: [] }, ['allow', 'deny', 'ask'])).toEqual({ deny: [] });
  });

  it('returns no list when permissions are unmanaged', () => {
    expect(managedLists(null, ['allow', 'deny', 'ask'])).toEqual({});
  });
});

describe('permissionEntries', () => {
  it('joins the managed lists in allow, deny, ask order', () => {
    expect(permissionEntries({ ask: ['Write'], allow: ['Read'] })).toEqual(['Read', 'Write']);
  });

  it('returns no entry when permissions are unmanaged', () => {
    expect(permissionEntries(null)).toEqual([]);
  });
});
