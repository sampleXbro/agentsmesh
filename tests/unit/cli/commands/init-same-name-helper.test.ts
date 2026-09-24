/**
 * importKeepingSameName: the per-tool step `init --yes` uses so a later tool's
 * same-name rule, command or agent never replaces or mixes with an earlier
 * tool's file (#132). The init flow itself is in init-same-name.test.ts.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importKeepingSameName } from '../../../../src/cli/commands/init-same-name.js';
import type { ImportResult } from '../../../../src/core/types.js';

const RULE = '.agentsmesh/rules/x.md';

let root: string;

const write = (rel: string, text: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');
const md = (text: string): string => `---\ndescription: d\n---\n\n${text}`;
const result = (toPath: string): ImportResult => ({
  fromTool: 'b',
  fromPath: join(root, 'src.md'),
  toPath,
  feature: 'rules',
});

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-same-name-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('importKeepingSameName', () => {
  it('tracks the rules, commands and agents an import wrote, not the root rule or settings', async () => {
    const owned = new Set<string>();

    await importKeepingSameName(root, 'a', owned, async () => [
      result(RULE),
      result('.agentsmesh\\commands\\c.md'),
      result('.agentsmesh/agents/g.md'),
      result('.agentsmesh/rules/_root.md'),
      result('.agentsmesh/permissions.yaml'),
      result('.agentsmesh/skills/s/SKILL.md'),
    ]);

    expect([...owned].sort()).toEqual([
      '.agentsmesh/agents/g.md',
      '.agentsmesh/commands/c.md',
      '.agentsmesh/rules/x.md',
    ]);
  });

  it('hides earlier files from the import and restores the ones it did not write', async () => {
    write(RULE, md('A'));
    let seen = true;

    await importKeepingSameName(root, 'b', new Set([RULE]), async () => {
      seen = existsSync(join(root, RULE));
      return [];
    });

    expect([seen, read(RULE)]).toEqual([false, md('A')]);
  });

  it('saves a different text under the next free name and keeps the earlier file', async () => {
    write(RULE, md('A'));

    const { results, copies } = await importKeepingSameName(
      root,
      'b',
      new Set([RULE]),
      async () => {
        write(RULE, md('B'));
        write('.agentsmesh/rules/x-b.md', md('OWN'));
        return [result(RULE), result('.agentsmesh/rules/x-b.md')];
      },
    );

    expect([
      read(RULE),
      read('.agentsmesh/rules/x-b-2.md'),
      read('.agentsmesh/rules/x-b.md'),
    ]).toEqual([md('A'), md('B'), md('OWN')]);
    expect(results.map((r) => r.toPath)).toEqual([
      '.agentsmesh/rules/x-b-2.md',
      '.agentsmesh/rules/x-b.md',
    ]);
    expect(copies).toEqual([{ path: RULE, copy: '.agentsmesh/rules/x-b-2.md', tool: 'b' }]);
  });

  it('keeps nested command folders in the copy name', async () => {
    const cmd = '.agentsmesh/commands/sub/deploy.md';
    write(cmd, md('A'));

    const { copies } = await importKeepingSameName(root, 'b', new Set([cmd]), async () => {
      write(cmd, md('B'));
      return [result(cmd)];
    });

    expect(copies).toEqual([
      { path: cmd, copy: '.agentsmesh/commands/sub/deploy-b.md', tool: 'b' },
    ]);
  });

  it('keeps the earlier file when the text is the same, with or without frontmatter', async () => {
    write(RULE, 'SAME\n');

    const { copies } = await importKeepingSameName(root, 'b', new Set([RULE]), async () => {
      write(RULE, '---\ndescription: other\n---\n\nSAME');
      return [result(RULE)];
    });

    expect([read(RULE), copies]).toEqual(['SAME\n', []]);
  });

  it('restores the earlier files when the import fails', async () => {
    write(RULE, md('A'));

    const failing = importKeepingSameName(root, 'b', new Set([RULE]), async () => {
      write(RULE, md('HALF'));
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');
    expect(read(RULE)).toBe(md('A'));
  });

  it('skips an earlier file that is already gone', async () => {
    await importKeepingSameName(root, 'b', new Set([RULE]), async () => []);

    expect(existsSync(join(root, RULE))).toBe(false);
  });
});
