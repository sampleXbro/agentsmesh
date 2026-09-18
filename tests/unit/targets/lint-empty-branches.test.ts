/**
 * Branch coverage for per-target lint helpers — exercises the empty/short-circuit
 * paths and the `permissions.ask ?? []` fallback used by amp/warp/cursor/cline.
 */

import { describe, it, expect } from 'vitest';
import * as warpLint from '../../../src/targets/warp/lint.js';
import * as ampLint from '../../../src/targets/amp/lint.js';
import * as cursorLint from '../../../src/targets/cursor/lint.js';
import * as clineLint from '../../../src/targets/cline/lint.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

function baseCanonical(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

describe('per-target lint — empty/edge branches', () => {
  const empty = baseCanonical();

  it('warp lint emits no diagnostics on fully-empty canonical', () => {
    expect(warpLint.lintHooks(empty)).toEqual([]);
    expect(warpLint.lintPermissions(empty)).toEqual([]);
    expect(warpLint.lintIgnore(empty)).toEqual([]);
  });

  it('warp lintHooks emits no diagnostic when canonical.hooks has only empty arrays', () => {
    expect(warpLint.lintHooks({ ...empty, hooks: { PostToolUse: [] } })).toEqual([]);
  });

  it('warp lintPermissions emits no diagnostic when allow/deny/ask are all empty (ask undefined)', () => {
    const result = warpLint.lintPermissions({
      ...empty,
      permissions: { allow: [], deny: [] }, // ask is undefined → triggers `?? []` branch
    });
    expect(result).toEqual([]);
  });

  it('warp lintPermissions emits diagnostic when ask has entries (ask defined branch)', () => {
    const result = warpLint.lintPermissions({
      ...empty,
      permissions: { allow: [], deny: [], ask: ['Bash(rm:*)'] },
    });
    expect(result).toHaveLength(1);
  });

  it('amp lintIgnore emits no diagnostic on empty canonical', () => {
    expect(ampLint.lintIgnore(empty)).toEqual([]);
  });

  it('cline lintHooks emits no diagnostic when canonical.hooks is present but empty', () => {
    expect(clineLint.lintHooks({ ...empty, hooks: { PostToolUse: [] } })).toEqual([]);
  });

  it('cline lintCommands filters out commands with no description and no allowed-tools', () => {
    const result = clineLint.lintCommands({
      ...empty,
      commands: [
        {
          source: '/x/commands/silent.md',
          name: 'silent',
          description: '',
          argumentHint: '',
          allowedTools: [],
          body: 'body',
        },
      ],
    });
    expect(result).toEqual([]);
  });

  it('cursor lint helpers (if present) return [] for empty canonical', () => {
    if (typeof cursorLint.lintHooks === 'function') {
      expect(cursorLint.lintHooks(empty)).toEqual([]);
    }
  });

  it('cline lintPermissions returns [] when canonical.permissions is null', () => {
    expect(clineLint.lintPermissions({ ...empty, permissions: null })).toEqual([]);
  });

  it('cline lintPermissions returns [] when allow/deny are empty and ask is absent', () => {
    expect(clineLint.lintPermissions({ ...empty, permissions: { allow: [], deny: [] } })).toEqual(
      [],
    );
  });

  it('cline lintPermissions warns when only allow has entries', () => {
    const out = clineLint.lintPermissions({
      ...empty,
      permissions: { allow: ['Read'], deny: [], ask: [] },
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.file).toBe('.agentsmesh/permissions.yaml');
    expect(out[0]!.target).toBe('cline');
  });

  it('cline lintPermissions warns when only deny has entries', () => {
    expect(
      clineLint.lintPermissions({ ...empty, permissions: { allow: [], deny: ['Bash'], ask: [] } }),
    ).toHaveLength(1);
  });

  it('cline lintPermissions warns when only ask has entries', () => {
    expect(
      clineLint.lintPermissions({ ...empty, permissions: { allow: [], deny: [], ask: ['Write'] } }),
    ).toHaveLength(1);
  });
});
