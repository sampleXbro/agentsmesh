import { AB_HOOKS } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as yamlParse } from 'yaml';
import { importClineHooks } from '../../../../src/targets/cline/hook-importer.js';
import { CLINE_HOOKS_DIR } from '../../../../src/targets/cline/constants.js';

const TEST_DIR = join(tmpdir(), 'am-cline-hook-importer-test');

function hookScript(event: string, matcher: string, command: string): string {
  return [
    '#!/usr/bin/env bash',
    `# agentsmesh-event: ${event}`,
    `# agentsmesh-matcher: ${matcher}`,
    `# agentsmesh-command: ${command}`,
    'set -e',
    command,
    '',
  ].join('\n');
}

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('importClineHooks', () => {
  it('returns empty and writes nothing when no hooks dirs exist', async () => {
    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(0);
  });

  it('imports hooks from .cline/hooks/ (project mode)', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'pretooluse-0.sh'),
      hookScript('PreToolUse', 'Bash', './scripts/validate.sh'),
    );

    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);

    expect(results).toHaveLength(1);
    expect(results[0]!.feature).toBe('hooks');
    expect(results[0]!.fromTool).toBe('cline');
    expect(results[0]!.toPath).toBe(AB_HOOKS);

    const content = readFileSync(join(TEST_DIR, AB_HOOKS), 'utf8');
    const parsed = yamlParse(content) as Record<string, unknown>;
    expect(Array.isArray(parsed['PreToolUse'])).toBe(true);
    const entries = parsed['PreToolUse'] as Array<Record<string, string>>;
    expect(entries[0]!.matcher).toBe('Bash');
    expect(entries[0]!.command).toBe('./scripts/validate.sh');
  });

  it('imports hooks from .cline/hooks/ when used as the global root (same relative path)', async () => {
    // Global scope resolves `.cline/hooks` against $HOME instead of the
    // project root — `projectRoot` here stands in for `homedir()`.
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'posttooluse-0.sh'),
      hookScript('PostToolUse', 'Write|Edit', 'prettier --write $FILE_PATH'),
    );

    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);

    expect(results).toHaveLength(1);
    const content = readFileSync(join(TEST_DIR, AB_HOOKS), 'utf8');
    const parsed = yamlParse(content) as Record<string, unknown>;
    expect(Array.isArray(parsed['PostToolUse'])).toBe(true);
  });

  it('skips files missing agentsmesh-event comment', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'posttooluse-0.sh'),
      '#!/usr/bin/env bash\n# agentsmesh-command: echo hi\necho hi\n',
    );

    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(0);
  });

  it('skips files missing agentsmesh-command comment', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'posttooluse-0.sh'),
      '#!/usr/bin/env bash\n# agentsmesh-event: PostToolUse\necho hi\n',
    );

    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);
    expect(results).toHaveLength(0);
  });

  it('imports multiple hooks for the same event', async () => {
    const hooksDir = join(TEST_DIR, CLINE_HOOKS_DIR);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, 'posttooluse-0.sh'),
      hookScript('PostToolUse', 'Write', 'prettier --write $FILE_PATH'),
    );
    writeFileSync(
      join(hooksDir, 'posttooluse-1.sh'),
      hookScript('PostToolUse', 'Edit', 'eslint --fix $FILE_PATH'),
    );

    const results: import('../../../../src/core/types.js').ImportResult[] = [];
    await importClineHooks(TEST_DIR, results);

    const content = readFileSync(join(TEST_DIR, AB_HOOKS), 'utf8');
    const parsed = yamlParse(content) as Record<string, unknown>;
    const entries = parsed['PostToolUse'] as Array<Record<string, string>>;
    expect(entries).toHaveLength(2);
  });
});
