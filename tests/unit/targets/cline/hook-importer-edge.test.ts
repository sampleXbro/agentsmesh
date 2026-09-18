/**
 * Branch coverage for src/targets/cline/hook-importer.ts:
 * - Line 40: empty/unreadable hook file is skipped.
 * - Line 44: missing # agentsmesh-matcher: comment → default '*' matcher.
 * - Lines 41-43: missing event or command meta skip the file.
 */

import { AB_HOOKS } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as yamlParse } from 'yaml';
import { importClineHooks } from '../../../../src/targets/cline/hook-importer.js';
import { CLINE_HOOKS_DIR } from '../../../../src/targets/cline/constants.js';
import type { ImportResult } from '../../../../src/core/types.js';

const TEST_DIR = join(tmpdir(), `am-cline-hook-edge-${process.pid}-${Date.now()}`);

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('importClineHooks — edge branches', () => {
  it('defaults matcher to "*" when no # agentsmesh-matcher: comment is present', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'h-0.sh'),
      [
        '#!/usr/bin/env bash',
        '# agentsmesh-event: PostToolUse',
        '# agentsmesh-command: echo ok',
        'echo ok',
      ].join('\n'),
    );

    const results: ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(1);
    const parsed = yamlParse(readFileSync(join(TEST_DIR, AB_HOOKS), 'utf8')) as Record<
      string,
      Array<{ matcher: string; command: string }>
    >;
    expect(parsed['PostToolUse']![0]!.matcher).toBe('*');
  });

  it('skips an empty .sh file (line 40 branch)', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'empty.sh'), '');
    const results: ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(0);
  });

  it('skips files missing # agentsmesh-event: or # agentsmesh-command:', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'no-event.sh'),
      ['#!/usr/bin/env bash', '# agentsmesh-command: echo', 'echo'].join('\n'),
    );
    writeFileSync(
      join(hooksDir, 'no-command.sh'),
      ['#!/usr/bin/env bash', '# agentsmesh-event: PostToolUse', ''].join('\n'),
    );
    const results: ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(0);
  });
});
