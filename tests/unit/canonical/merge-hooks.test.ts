/**
 * `combineHooks(local, pack)`: per event the local hooks come first, then every
 * pack hook the local side does not already define, so a local event never
 * silently drops a pack's hooks. (Layered extends still override per event:
 * see `mergeCanonicalFiles` and extends-hooks-layers.test.ts.)
 */

import { describe, expect, it } from 'vitest';
import { combineHooks, mergeCanonicalFiles } from '../../../src/canonical/load/merge.js';
import type { CanonicalFiles, HookEntry, Hooks } from '../../../src/core/types.js';

function withHooks(hooks: Hooks | null): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks,
    ignore: [],
  };
}

/** A pack's hooks under the local ones, as the loader combines them. */
function mergedHooks(pack: Hooks | null, local: Hooks | null): Hooks | null {
  return combineHooks(local, pack);
}

const packGuard: HookEntry = { matcher: 'Bash', command: 'pack-guard.sh', type: 'command' };
const localRecall: HookEntry = {
  matcher: 'Edit|Write',
  command: 'agentsmesh lessons hook',
  type: 'command',
};

describe('mergeCanonicalFiles — hooks modes', () => {
  it('overrides per event by default, and combines when asked', () => {
    const base = withHooks({ PreToolUse: [packGuard] });
    const overlay = withHooks({ PreToolUse: [localRecall] });
    expect(mergeCanonicalFiles(base, overlay).hooks).toEqual({ PreToolUse: [localRecall] });
    expect(mergeCanonicalFiles(base, overlay, { hooks: 'combine' }).hooks).toEqual({
      PreToolUse: [packGuard, localRecall],
    });
  });
});

describe('combineHooks (local over pack)', () => {
  it('keeps pack hooks for an event the local hooks.yaml also defines, local first', () => {
    const hooks = mergedHooks({ PreToolUse: [packGuard] }, { PreToolUse: [localRecall] });
    expect(hooks).toEqual({ PreToolUse: [localRecall, packGuard] });
  });

  it('keeps the local entry when both define the same type, matcher and command', () => {
    const packCopy: HookEntry = { ...packGuard, timeout: 10 };
    const localCopy: HookEntry = { ...packGuard, timeout: 30 };
    const hooks = mergedHooks({ PreToolUse: [packCopy] }, { PreToolUse: [localCopy] });
    expect(hooks).toEqual({ PreToolUse: [localCopy] });
  });

  it('treats a hook without a type as a command hook when matching', () => {
    const untyped: HookEntry = { matcher: 'Bash', command: 'pack-guard.sh' };
    const hooks = mergedHooks({ PreToolUse: [packGuard] }, { PreToolUse: [untyped] });
    expect(hooks).toEqual({ PreToolUse: [untyped] });
  });

  it('keeps a prompt hook and a command hook with the same text apart', () => {
    const prompt: HookEntry = { matcher: '*', command: 'Check it.', type: 'prompt' };
    const command: HookEntry = { matcher: '*', command: 'Check it.', type: 'command' };
    const hooks = mergedHooks({ Stop: [prompt] }, { Stop: [command] });
    expect(hooks).toEqual({ Stop: [command, prompt] });
  });

  it('keeps a hook whose matcher differs from the local one', () => {
    const localEdit: HookEntry = { ...packGuard, matcher: 'Edit' };
    const hooks = mergedHooks({ PreToolUse: [packGuard] }, { PreToolUse: [localEdit] });
    expect(hooks).toEqual({ PreToolUse: [localEdit, packGuard] });
  });

  it('passes through events only one side defines', () => {
    const hooks = mergedHooks({ PreToolUse: [packGuard] }, { PostToolUse: [localRecall] });
    expect(hooks).toEqual({ PreToolUse: [packGuard], PostToolUse: [localRecall] });
  });

  it('returns null only when neither side has hooks', () => {
    expect(mergedHooks(null, null)).toBeNull();
    expect(mergedHooks(null, { PreToolUse: [localRecall] })).toEqual({
      PreToolUse: [localRecall],
    });
  });
});
