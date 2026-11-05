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
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
});
