/**
 * Removing a target from `targets:` must also remove the files that target's
 * earlier runs generated. The stale sweep only walks configured targets, and a
 * full run replaces the lock's `outputs` map, so before the fix these files
 * stayed for ever and nothing in the lock pointed at them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { readLock, writeLock } from '../../../../src/config/core/lock.js';
import { buildOutputChecksums } from '../../../../src/config/core/lock-outputs.js';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { useCapturedOutput } from '../renderers/renderer-test-helpers.js';

const ALL = ['claude-code', 'codex-cli', 'copilot', 'cursor'];
const shared = (path: string): { path: string; reason: 'shared' } => ({ path, reason: 'shared' });
const edited = (path: string): { path: string; reason: 'edited' } => ({ path, reason: 'edited' });
const CURSOR_REMOVED = [
  '.cursor/AGENTS.md',
  '.cursor/rules/general.mdc',
  '.cursor/skills/demo/SKILL.md',
];
const CURSOR_SHARED = ['.cursor/hooks.json', '.cursor/mcp.json'];

let root = '';
let canonicalDir = '';

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

function tree(dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? tree(join(dir, e.name)) : [join(dir, e.name).slice(root.length + 1)],
    )
    .sort();
}

const generate = (flags: Record<string, string | boolean> = {}): ReturnType<typeof runGenerate> =>
  runGenerate(flags, root, { printMatrix: false });

const lockedPaths = async (): Promise<string[]> =>
  Object.keys((await readLock(canonicalDir))?.outputs ?? {}).sort();

const output = useCapturedOutput();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-removed-targets-'));
  canonicalDir = join(root, '.agentsmesh');
  write('.agentsmesh/rules/_root.md', '---\nroot: true\ndescription: Root\n---\n# Root\n');
  write('.agentsmesh/skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n# Demo\n');
  write('.agentsmesh/mcp.json', '{"mcpServers":{"s":{"command":"node","args":["x.js"]}}}');
  write(
    '.agentsmesh/hooks.yaml',
    'PostToolUse:\n  - matcher: Edit\n    type: command\n    command: echo hi\n',
  );
  setTargets(ALL);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('generate after a target was removed from the config', () => {
  it('deletes its unmodified outputs, keeps its shared configs, and drops it from the lock', async () => {
    await generate();
    const before = tree();
    const lockBefore = await lockedPaths();
    expect(before.filter((p) => p.startsWith('.cursor/'))).toEqual(
      [...CURSOR_REMOVED, ...CURSOR_SHARED].sort(),
    );
    setTargets(ALL.filter((t) => t !== 'cursor'));

    const result = await generate();

    expect(result.exitCode).toBe(0);
    expect(tree()).toEqual(before.filter((p) => !CURSOR_REMOVED.includes(p)));
    expect(existsSync(join(root, '.cursor/rules'))).toBe(false);
    expect(existsSync(join(root, '.cursor/skills'))).toBe(false);
    expect(result.data.removed).toEqual(CURSOR_REMOVED);
    expect(result.data.kept).toEqual(CURSOR_SHARED.map(shared));
    expect(Object.keys(JSON.parse(JSON.stringify(result.data))).sort()).toEqual([
      'files',
      'kept',
      'mode',
      'removed',
      'scope',
      'summary',
    ]);
    expect(await lockedPaths()).toEqual(
      lockBefore.filter((p) => !CURSOR_REMOVED.includes(p) && !CURSOR_SHARED.includes(p)),
    );
  });

  it('prints the removals and an honest summary instead of "Nothing changed"', async () => {
    await generate();
    setTargets(ALL.filter((t) => t !== 'cursor'));
    const result = await generate();
    const unchanged = result.data.summary.unchanged;
    expect(unchanged).toBeGreaterThan(0);

    renderGenerate(result);

    expect(output.stdout()).toBe(
      [
        ...CURSOR_REMOVED.map((p) => `✓ removed ${p}`),
        `Generated: 0 created, 0 updated, 3 removed, ${unchanged} unchanged`,
        '',
      ].join('\n'),
    );
    expect(output.stderr().split('\n').filter(Boolean)).toHaveLength(CURSOR_SHARED.length);
  });

  it('keeps a path another configured target still produces', async () => {
    await generate();
    setTargets(['claude-code', 'codex-cli']);

    await generate();

    expect(tree().filter((p) => p === 'AGENTS.md' || p === '.agents/skills/demo/SKILL.md')).toEqual(
      ['.agents/skills/demo/SKILL.md', 'AGENTS.md'],
    );
    expect(await lockedPaths()).toContain('AGENTS.md');
  });

  it('keeps a file edited by hand, warns once, and stops tracking it', async () => {
    await generate();
    write('.cursor/rules/general.mdc', 'my own rule\n');
    setTargets(ALL.filter((t) => t !== 'cursor'));

    const first = await generate();

    expect(readFileSync(join(root, '.cursor/rules/general.mdc'), 'utf-8')).toBe('my own rule\n');
    expect(first.data.kept).toEqual([
      shared('.cursor/hooks.json'),
      shared('.cursor/mcp.json'),
      edited('.cursor/rules/general.mdc'),
    ]);
    expect(first.data.removed).toEqual(['.cursor/AGENTS.md', '.cursor/skills/demo/SKILL.md']);
    expect(tree().filter((p) => p.startsWith('.cursor/'))).toEqual([
      '.cursor/hooks.json',
      '.cursor/mcp.json',
      '.cursor/rules/general.mdc',
    ]);
    expect(await lockedPaths()).not.toContain('.cursor/rules/general.mdc');

    const second = await generate();

    expect(second.data.kept).toBeUndefined();
    expect(second.data.removed).toBeUndefined();
    expect(existsSync(join(root, '.cursor/rules/general.mdc'))).toBe(true);
  });

  it('finds outputs of a target nothing knows about, such as a removed plugin', async () => {
    await generate();
    write('.gone-plugin/rules/a.md', '# generated\n');
    const lock = await readLock(canonicalDir);
    if (lock === null) throw new Error('lock missing');
    await writeLock(canonicalDir, {
      ...lock,
      outputs: {
        ...lock.outputs,
        ...buildOutputChecksums([
          {
            target: 'gone',
            path: '.gone-plugin/rules/a.md',
            content: '# generated\n',
            status: 'created',
          },
        ]),
      },
    });

    const result = await generate();

    expect(result.data.removed).toEqual(['.gone-plugin/rules/a.md']);
    expect(existsSync(join(root, '.gone-plugin'))).toBe(false);
    expect(await lockedPaths()).not.toContain('.gone-plugin/rules/a.md');
  });
});

describe('generate with --targets or --dry-run after a target was removed', () => {
  it('does not delete anything on a --targets run, and still tracks the files', async () => {
    await generate();
    const before = tree();
    const lockBefore = await lockedPaths();
    setTargets(ALL.filter((t) => t !== 'cursor'));

    const filtered = await generate({ targets: 'claude-code' });

    expect(tree()).toEqual(before);
    expect(filtered.data.removed).toBeUndefined();
    expect(filtered.data.kept).toBeUndefined();
    expect(await lockedPaths()).toEqual(lockBefore);

    await generate();

    expect(tree()).toEqual(before.filter((p) => !CURSOR_REMOVED.includes(p)));
  });

  it('reports the removals on --dry-run and changes nothing', async () => {
    await generate();
    const before = tree();
    const lock = readFileSync(join(canonicalDir, '.lock'), 'utf-8');
    setTargets(ALL.filter((t) => t !== 'cursor'));

    const result = await generate({ 'dry-run': true });

    expect(tree()).toEqual(before);
    expect(readFileSync(join(canonicalDir, '.lock'), 'utf-8')).toBe(lock);
    expect(result.data.mode).toBe('dry-run');
    expect(result.data.removed).toEqual(CURSOR_REMOVED);
    expect(result.data.kept).toEqual(CURSOR_SHARED.map(shared));

    renderGenerate(result);

    expect(output.stdout().split('\n')).toEqual([
      ...result.data.files.map((f) => `[dry-run] ${f.status} ${f.path} (${f.target})`),
      ...CURSOR_REMOVED.map((p) => `[dry-run] removed ${p}`),
      '',
    ]);
  });
});

describe('generate --global after a target was removed', () => {
  it('removes the files under the home directory and prints them with a ~/ prefix', async () => {
    vi.stubEnv('HOME', root);
    vi.stubEnv('USERPROFILE', root);
    rmSync(join(root, 'agentsmesh.yaml'));
    write(
      '.agentsmesh/agentsmesh.yaml',
      'version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules]\n',
    );
    await generate({ global: true });
    expect(tree().filter((p) => !p.startsWith('.agentsmesh/'))).toEqual([
      '.claude/CLAUDE.md',
      '.cursor/AGENTS.md',
      '.cursor/rules/general.mdc',
    ]);
    write('.agentsmesh/agentsmesh.yaml', 'version: 1\ntargets: [claude-code]\nfeatures: [rules]\n');

    const result = await generate({ global: true });

    expect(tree().filter((p) => !p.startsWith('.agentsmesh/'))).toEqual(['.claude/CLAUDE.md']);
    expect(existsSync(join(root, '.cursor'))).toBe(false);
    expect(result.data.removed).toEqual(['.cursor/AGENTS.md', '.cursor/rules/general.mdc']);

    renderGenerate(result);

    expect(output.stdout()).toContain(
      '✓ removed ~/.cursor/AGENTS.md\n✓ removed ~/.cursor/rules/general.mdc\n',
    );
    expect(await lockedPaths()).toEqual(['.claude/CLAUDE.md']);
  });
});
