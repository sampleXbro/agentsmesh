/**
 * `check` gives the fix that matches the drift. It used to print one hint for
 * every case — "Run 'agentsmesh merge' to resolve, or 'agentsmesh generate
 * --force' to accept current state." — though merge only fixes a lock with git
 * conflict markers, `--force` only matters for locked features, and plain
 * `generate` fixes canonical and generated-output drift.
 */

import { describe, expect, it } from 'vitest';
import type { CheckData } from '../../../../src/cli/command-result.js';
import { renderCheck } from '../../../../src/cli/renderers/check.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

const IN_SYNC: CheckData = {
  hasLock: true,
  lockConflict: false,
  canonicalDrift: false,
  outputDrift: false,
  inSync: true,
  modified: [],
  added: [],
  removed: [],
  extendsModified: [],
  lockedViolations: [],
  outputsModified: [],
  outputsRemoved: [],
  outputsStale: [],
  outputsUntracked: [],
  outputsChecked: true,
};

const OUTPUT_HINT =
  "Run 'agentsmesh generate' to rewrite the generated files from .agentsmesh/ and record " +
  'their checksums. It replaces hand edits to generated files, so put lasting changes in ' +
  '.agentsmesh/.';
const CANONICAL_HINT =
  "Run 'agentsmesh generate' to apply the .agentsmesh/ changes and update the lock.";
const LOCKED_HINT =
  'Locked features changed (collaboration.strategy: lock). Revert them, or run ' +
  "'agentsmesh generate --force' to accept the change.";
const CONFLICT =
  "The lock file has unresolved git merge conflicts. Run 'agentsmesh merge' to rebuild it, " +
  "then 'agentsmesh generate'.";

describe('renderCheck — the hint matches the drift', () => {
  const output = useCapturedOutput();
  const render = (data: Partial<CheckData>): string => {
    renderCheck({ exitCode: 1, data: { ...IN_SYNC, inSync: false, ...data } });
    return output.stdout() + output.stderr();
  };

  it('points generated-output drift at generate (the state after agentsmesh merge)', () => {
    const all = render({ outputDrift: true, outputsModified: ['.claude/rules/b.md'] });
    expect(all).toContain(`${OUTPUT_HINT}\n`);
    expect(all).not.toMatch(/agentsmesh merge|--force/);
  });

  it('points canonical drift at generate', () => {
    const all = render({ canonicalDrift: true, modified: ['rules/a.md'] });
    expect(all).toContain(`${CANONICAL_HINT}\n`);
    expect(all).not.toMatch(/agentsmesh merge|--force|rewrite the generated files/);
  });

  it('gives the canonical hint when canonical and output drift come together', () => {
    const all = render({
      canonicalDrift: true,
      outputDrift: true,
      modified: ['rules/a.md'],
      outputsModified: ['.claude/rules/a.md'],
    });
    expect(all).toContain(CANONICAL_HINT);
    expect(all).not.toContain(OUTPUT_HINT);
  });

  it('points locked-feature changes at --force, which plain generate needs for them', () => {
    const all = render({
      canonicalDrift: true,
      modified: ['mcp.json', 'rules/a.md'],
      lockedViolations: ['mcp.json'],
    });
    expect(all).toContain(`${LOCKED_HINT}\n`);
    expect(all).not.toMatch(/agentsmesh merge|apply the \.agentsmesh\/ changes/);
  });

  it('points a lock with git conflict markers at merge, not at a missing lock', () => {
    const all = render({ hasLock: false, lockConflict: true, outputsChecked: false });
    expect(all).toContain(`${CONFLICT}\n`);
    expect(all).not.toContain('Not initialized');
  });
});
