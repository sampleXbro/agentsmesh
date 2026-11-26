/**
 * `generate --check` through `runGenerate`: the files of a target removed from
 * `targets:` are drift, because a real run deletes them. Edited and shared
 * files are kept, so they only warn.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { handleResult } from '../../../../src/cli/json-handler.js';
import { useCapturedOutput } from '../renderers/renderer-test-helpers.js';

const ALL = ['claude-code', 'codex-cli', 'copilot', 'cursor'];
const CURSOR_REMOVED = [
  '.cursor/AGENTS.md',
  '.cursor/rules/general.mdc',
  '.cursor/skills/demo/SKILL.md',
];
const CURSOR_SHARED = ['.cursor/hooks.json', '.cursor/mcp.json'];
const SHARED_TEXT =
  'it is a shared tool config and no target generates it now. Remove the agentsmesh entries yourself if you do not need them.';

let root = '';
const output = useCapturedOutput();

function write(rel: string, content: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function setTargets(targets: string[]): void {
  write(
    'agentsmesh.yaml',
    `version: 1\ntargets: [${targets.join(', ')}]\nfeatures: [rules, skills, mcp, hooks]\n`,
  );
}

const run = (flags: Record<string, string | boolean>): ReturnType<typeof runGenerate> =>
  runGenerate(flags, root, { printMatrix: false });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'am-removed-check-run-'));
  write('.agentsmesh/rules/_root.md', '---\nroot: true\ndescription: Root\n---\n# Root\n');
  write('.agentsmesh/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n# Demo\n');
  write('.agentsmesh/mcp.json', '{"mcpServers":{"s":{"command":"node","args":["x.js"]}}}');
  write(
    '.agentsmesh/hooks.yaml',
    'PostToolUse:\n  - matcher: Edit\n    type: command\n    command: echo hi\n',
  );
  setTargets(ALL);
  await run({});
  setTargets(ALL.filter((t) => t !== 'cursor'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('generate --check after a target was removed from the config', () => {
  it('fails, lists the leftovers, never says in sync, and changes nothing', async () => {
    const lock = readFileSync(join(root, '.agentsmesh/.lock'), 'utf-8');

    const result = await run({ check: true });
    renderGenerate(result);

    expect(result.exitCode).toBe(1);
    expect(result.lockWritten).toBe(false);
    expect(result.data.mode).toBe('check');
    expect(result.data.removed).toEqual(CURSOR_REMOVED);
    expect(result.data.kept).toEqual(CURSOR_SHARED.map((path) => ({ path, reason: 'shared' })));
    expect(output.stdout()).toBe('');
    expect(output.stderr()).toBe(
      [
        ...CURSOR_REMOVED.map((p) => `✗ [check] stale ${p}`),
        ...CURSOR_SHARED.map((p) => `⚠ Kept ${p}: ${SHARED_TEXT}`),
        "✗ Generated files are out of sync. Run 'agentsmesh generate' to remove them.",
        '',
      ].join('\n'),
    );
    expect(readFileSync(join(root, '.agentsmesh/.lock'), 'utf-8')).toBe(lock);
    expect(readFileSync(join(root, '.cursor/rules/general.mdc'), 'utf-8')).toContain('# Root');
  });

  it('is clean again once a real run removed them, and the kept configs stop warning', async () => {
    await run({});

    const result = await run({ check: true });
    renderGenerate(result);

    expect(result.exitCode).toBe(0);
    expect(result.data.removed).toBeUndefined();
    expect(result.data.kept).toBeUndefined();
    expect(output.stdout()).toBe('✓ Generated files are in sync.\n');
    expect(output.stderr()).toBe('');
  });

  it('only warns when every leftover is a file the user edited, and stays in sync', async () => {
    for (const path of CURSOR_REMOVED) write(path, 'mine\n');

    const result = await run({ check: true });
    renderGenerate(result);

    expect(result.exitCode).toBe(0);
    expect(result.data.removed).toBeUndefined();
    expect(result.data.kept).toEqual([
      { path: '.cursor/AGENTS.md', reason: 'edited' },
      { path: '.cursor/hooks.json', reason: 'shared' },
      { path: '.cursor/mcp.json', reason: 'shared' },
      { path: '.cursor/rules/general.mdc', reason: 'edited' },
      { path: '.cursor/skills/demo/SKILL.md', reason: 'edited' },
    ]);
    expect(output.stdout()).toBe('✓ Generated files are in sync.\n');
    expect(output.stderr().split('\n')).toHaveLength(5 + 1);
  });

  it('says update, and lists both, when generated files drifted as well', async () => {
    write('.agentsmesh/rules/_root.md', '---\nroot: true\ndescription: Root\n---\n# Root v2\n');

    const result = await run({ check: true });
    renderGenerate(result);

    expect(result.exitCode).toBe(1);
    expect(result.data.removed).toEqual(CURSOR_REMOVED);
    expect(result.data.files.filter((f) => f.status !== 'unchanged').length).toBeGreaterThan(0);
    expect(output.stderr()).toContain('✗ [check] updated ');
    expect(output.stderr()).toContain('✗ [check] stale .cursor/AGENTS.md');
    expect(output.stderr()).toContain('to update them.');
    expect(output.stderr()).not.toContain('to remove them.');
  });

  it('puts the removed and kept files in the --json envelope and exits 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const result = await run({ check: true });

    handleResult('generate', result, { check: true, json: true }, () => undefined);

    const envelope = JSON.parse(output.stdout());
    expect(Object.keys(envelope)).toEqual(['success', 'command', 'error', 'data']);
    expect(envelope.success).toBe(false);
    expect(envelope.data.removed).toEqual(CURSOR_REMOVED);
    expect(envelope.data.kept).toEqual(CURSOR_SHARED.map((path) => ({ path, reason: 'shared' })));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('ignores a --targets run, which cannot tell a removed target from a skipped one', async () => {
    const result = await run({ check: true, targets: 'claude-code' });

    expect(result.exitCode).toBe(0);
    expect(result.data.removed).toBeUndefined();
    expect(result.data.kept).toBeUndefined();
  });
});
