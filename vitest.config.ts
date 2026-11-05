import { defineConfig } from 'vitest/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Cold remote-extends cache per run: a warm developer cache hides a test's network dependency. */
const REMOTE_CACHE = mkdtempSync(join(tmpdir(), 'agentsmesh-test-cache-'));

export default defineConfig({
  test: {
    /**
     * Tests must never depend on the developer's git credentials or a warm
     * remote cache: a unit test that cloned a private `extends` source passed
     * locally and failed on every CI runner. These make the suite behave like a
     * machine with no credentials, so that class of bug reproduces here too.
     * Local `file://` clones (the ones tests legitimately use) are unaffected.
     */
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: 'false',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: '',
      AGENTSMESH_CACHE: REMOTE_CACHE,
    },
    // Git hooks export GIT_DIR/GIT_INDEX_FILE; inherited, test git hits the real repo.
    setupFiles: ['./tests/setup/isolate-git-env.ts'],
    testTimeout: 60_000,
    // Parity with vitest.e2e.config.ts: this config also runs tests/e2e, whose
    // setup hooks spawn the built CLI plus git. 10s tripped on a Windows runner.
    hookTimeout: 30_000,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/contract/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
      'tests/agents-folder-structure-research.test.ts',
      'tests/import-generate-roundtrip.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `json-summary` feeds scripts/coverage-floor.ts; `lcov` feeds Codecov.
      // `json` keeps coverage-final.json for per-branch triage of floor failures.
      reporter: ['text', 'html', 'lcov', 'json', 'json-summary'],
      // ─────────────────────────────────────────────────────────────────────
      // Two-tier gate:
      //  1. Aggregate thresholds below (95%) over every included file.
      //  2. A per-file floor (scripts/coverage-floor.ts, run by test:coverage)
      //     so a new untested module cannot hide inside the aggregate.
      // Exclusions are deliberately minimal. Each entry must be either a
      // types-only module (nothing executable) or a process boundary that
      // vitest cannot exercise in-process. "Covered by integration tests" is
      // not a reason: those files count toward the floor like any other.
      // ─────────────────────────────────────────────────────────────────────
      exclude: [
        // Types-only: interfaces and type aliases, no executable statements.
        'src/core/types.ts',
        'src/core/result-types.ts',
        'src/targets/catalog/target.interface.ts',
        // Process boundaries: the stdio MCP server entry and the long-lived
        // file watcher run as real processes in the e2e suite (uninstrumented).
        'src/mcp/server.ts',
        'src/cli/commands/watch.ts',
      ],
      thresholds: {
        // Aggregate over the included set. The per-file floor lives in
        // scripts/coverage-floor-core.ts (DEFAULT_FLOOR).
        lines: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
});
