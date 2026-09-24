/**
 * Regression: the MCP `generate` handler must persist `.agentsmesh/.lock`,
 * exactly like the CLI `generate`. A prior version wrote target files but
 * skipped the lockfile, leaving `check` permanently drifted (false positive in
 * CI) while still reporting `lockfileUpdated: true`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTestProject, cleanup } from '../e2e/helpers/setup.js';
import { resolveContext } from '../../src/mcp/context.js';
import { orchestrateHandlers } from '../../src/mcp/handlers/orchestrate.js';

describe('mcp generate — lockfile persistence', () => {
  let dir: string;

  afterEach(() => {
    if (dir) cleanup(dir);
  });

  it('writes .agentsmesh/.lock and leaves check clean after a real generate', async () => {
    dir = createTestProject('canonical-full');
    const ctx = await resolveContext({ cwd: dir });

    const result = await orchestrateHandlers.generate(ctx, {});

    expect(result.lockfileUpdated).toBe(true);
    expect(existsSync(join(dir, '.agentsmesh', '.lock'))).toBe(true);

    const check = await orchestrateHandlers.check(ctx);
    // A real generate writes an `outputs` map, so output verification runs
    // (outputsChecked: true) and finds no drift right after generation.
    expect(check).toEqual({
      drift: false,
      lockConflict: false,
      lessonsGraphError: null,
      canonicalDrift: false,
      outputDrift: false,
      missing: [],
      extra: [],
      modified: [],
      outputsModified: [],
      outputsRemoved: [],
      outputsStale: [],
      staleTargets: [],
      outputsChecked: true,
    });
  });

  it('does not write the lockfile on dry_run', async () => {
    dir = createTestProject('canonical-full');
    const ctx = await resolveContext({ cwd: dir });

    const result = await orchestrateHandlers.generate(ctx, { dry_run: true });

    expect(result.lockfileUpdated).toBe(false);
    expect(existsSync(join(dir, '.agentsmesh', '.lock'))).toBe(false);
  });
});
