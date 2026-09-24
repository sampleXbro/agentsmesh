/**
 * A `generate --targets` run that leaves out an enabled target must not move
 * the lock's canonical checksums forward: the skipped target's outputs were
 * not regenerated, so `check` must fail until a full generate (#136).
 */

import {
  appendFileSync,
  existsSync,
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

  it('does not create a lock on a first run that skips a target', async () => {
    await generate({ targets: 'cursor' });

    expect([existsSync(join(root, '.agentsmesh', '.lock')), await checkExit()]).toEqual([false, 1]);
  });
});
