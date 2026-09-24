/**
 * A `generate --targets` run that leaves out an enabled target after canonical
 * sources changed did not regenerate it. The lock lists it in `stale_targets`,
 * so `check` fails until that target is generated again (#136).
 */

import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../../../src/cli/commands/check.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { loadConfigFromDir } from '../../../../src/config/core/loader.js';
import { checkLockSync } from '../../../../src/core/check/lock-sync.js';

let root: string;
const ROOT_RULE = (): string => join(root, '.agentsmesh', 'rules', '_root.md');
const generate = (flags: Record<string, string> = {}): Promise<unknown> =>
  runGenerate(flags, root, { printMatrix: false });
const checkExit = async (): Promise<number> => (await runCheck({}, root)).exitCode;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-filtered-check-')));
  mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(root, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules]\n',
  );
  writeFileSync(ROOT_RULE(), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('check after generate --targets', () => {
  it('fails while a skipped target is stale, and passes after a full generate', async () => {
    await generate();
    appendFileSync(ROOT_RULE(), '\n- NEW LINE XYZ\n');

    await generate({ targets: 'cursor' });
    const afterFiltered = await checkExit();
    await generate();

    expect(readFileSync(join(root, '.cursor', 'rules', 'general.mdc'), 'utf8')).toContain(
      'NEW LINE XYZ',
    );
    expect([afterFiltered, await checkExit()]).toEqual([1, 0]);
  });

  it('treats a --targets list that names every enabled target as a full run', async () => {
    await generate();
    appendFileSync(ROOT_RULE(), '\n- NEW LINE XYZ\n');

    await generate({ targets: 'claude-code,cursor' });

    expect(await checkExit()).toBe(0);
  });

  it('stays in sync after a filtered run when nothing canonical changed', async () => {
    await generate();

    await generate({ targets: 'cursor' });

    expect(await checkExit()).toBe(0);
  });

  it('passes after two filtered runs that together cover every target', async () => {
    await generate();
    appendFileSync(ROOT_RULE(), '\n- NEW LINE XYZ\n');

    await generate({ targets: 'cursor' });
    await generate({ targets: 'claude-code' });

    expect(await checkExit()).toBe(0);
  });

  it('records the skipped targets on a first filtered run, and check names them', async () => {
    await generate({ targets: 'cursor' });

    const lock = readFileSync(join(root, '.agentsmesh', '.lock'), 'utf8');
    const report = await checkLockSync({
      config: (await loadConfigFromDir(root)).config,
      configDir: root,
      canonicalDir: join(root, '.agentsmesh'),
      rootBase: root,
    });

    expect(lock).toContain('stale_targets:\n  - claude-code\n');
    expect([report.inSync, report.staleTargets]).toEqual([false, ['claude-code']]);
    expect(await checkExit()).toBe(1);
  });
});
