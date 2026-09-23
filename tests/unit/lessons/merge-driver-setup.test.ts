import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runGit } from '../../../src/lessons/git-exec.js';
import {
  ensureLessonsMergeDriver,
  mergeDriverSetupLine,
} from '../../../src/lessons/merge-driver-setup.js';
import { git, initRepo, writeFile } from '../../helpers/temp-git-repo.js';

const KEY = 'merge.agentsmesh-lessons.driver';
const BARE = 'agentsmesh lessons merge-driver %O %A %B';
const LOCAL_FIRST = 'npx --no --offline agentsmesh lessons merge-driver %O %A %B';
// Hook-exported git vars would point git at another repo; host config could hold a driver.
const HOOK_ENV = [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'PATH',
] as const;
const savedEnv: Record<string, string | undefined> = {};

let root: string;
let bin: string;
const localConfig = (key: string): string | null => {
  const r = runGit(root, ['config', '--local', '--get', key]);
  return r.status === 0 ? r.stdout.trim() : null;
};
function boundRepo(): void {
  initRepo(root);
  writeFile(root, '.gitattributes', '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons\n');
}

beforeAll(() => {
  for (const k of HOOK_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), 'am-driver-setup-no-global-gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  // The driver is only configured when git can start it: put stand-in launchers on PATH.
  bin = mkdtempSync(join(tmpdir(), 'am-driver-setup-bin-'));
  for (const name of ['agentsmesh', 'agentsmesh.cmd', 'npx', 'npx.cmd']) {
    writeFileSync(join(bin, name), '');
  }
  process.env.PATH = [bin, savedEnv.PATH ?? ''].join(delimiter);
});
afterAll(() => {
  for (const k of HOOK_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(bin, { recursive: true, force: true });
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-driver-setup-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('ensureLessonsMergeDriver', () => {
  it('does nothing outside a git work tree', () => {
    expect(ensureLessonsMergeDriver(root)).toEqual({ status: 'skipped', command: BARE });
  });

  it('does nothing when .gitattributes does not bind lessons.json to the driver', () => {
    initRepo(root);
    expect(ensureLessonsMergeDriver(root).status).toBe('skipped');
    expect(localConfig(KEY)).toBeNull();
  });

  it('configures the driver and its name once, then reports it unchanged', () => {
    boundRepo();
    expect(ensureLessonsMergeDriver(root)).toEqual({ status: 'configured', command: BARE });
    expect(localConfig(KEY)).toBe(BARE);
    expect(localConfig('merge.agentsmesh-lessons.name')).toBe('agentsmesh lessons union');
    expect(ensureLessonsMergeDriver(root)).toEqual({ status: 'unchanged', command: BARE });
  });

  it('finds the binding for a project in a subdirectory of the repository', () => {
    initRepo(root);
    const project = join(root, 'packages', 'app');
    writeFile(
      project,
      '.gitattributes',
      '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons\n',
    );
    expect(ensureLessonsMergeDriver(project).status).toBe('configured');
    expect(localConfig(KEY)).toBe(BARE);
  });

  it('prefers the local install when the project depends on agentsmesh', () => {
    boundRepo();
    writeFile(root, 'package.json', JSON.stringify({ devDependencies: { agentsmesh: '^1.0.0' } }));
    expect(ensureLessonsMergeDriver(root)).toEqual({ status: 'configured', command: LOCAL_FIRST });
    expect(localConfig(KEY)).toBe(LOCAL_FIRST);
  });

  it('upgrades a value agentsmesh itself suggested before', () => {
    boundRepo();
    git(root, ['config', KEY, BARE]);
    writeFile(root, 'package.json', JSON.stringify({ dependencies: { agentsmesh: '1.0.0' } }));
    expect(ensureLessonsMergeDriver(root).status).toBe('updated');
    expect(localConfig(KEY)).toBe(LOCAL_FIRST);
  });

  it('keeps a custom driver value and reports it', () => {
    boundRepo();
    git(root, ['config', KEY, 'my-merge %O %A %B']);
    expect(ensureLessonsMergeDriver(root)).toEqual({
      status: 'custom',
      command: BARE,
      existing: 'my-merge %O %A %B',
    });
    expect(localConfig(KEY)).toBe('my-merge %O %A %B');
  });

  it('writes an absolute CLI path with forward slashes (git runs drivers via sh)', () => {
    boundRepo();
    const setup = ensureLessonsMergeDriver(root, { invocation: 'node C:\\tools\\am\\cli.js' });
    expect(setup.command).toBe('node C:/tools/am/cli.js lessons merge-driver %O %A %B');
    expect(localConfig(KEY)).toBe(setup.command);
  });

  it('reports a failed git config write instead of throwing', () => {
    boundRepo();
    const setup = ensureLessonsMergeDriver(root, {
      git: (cwd, args) =>
        args[0] === 'config' && args.length === 4
          ? { status: 255, stdout: '', stderr: 'error: could not lock config file' }
          : runGit(cwd, args),
    });
    expect(setup).toEqual({
      status: 'failed',
      command: BARE,
      reason: `git config failed (error: could not lock config file); run: git config ${KEY} "${BARE}"`,
    });
  });

  it('refuses a driver git could not start: that would keep our side with no markers', () => {
    boundRepo();
    const setup = ensureLessonsMergeDriver(root, { invocation: 'not-installed-am-xyz' });
    expect(setup).toEqual({
      status: 'failed',
      command: 'not-installed-am-xyz lessons merge-driver %O %A %B',
      reason:
        '`not-installed-am-xyz` is not on PATH, so git could not start the driver; install ' +
        'agentsmesh globally or as a project devDependency',
    });
    expect(localConfig(KEY)).toBeNull();
  });
});

describe('mergeDriverSetupLine', () => {
  it('prints one line for a change or a problem, nothing otherwise', () => {
    expect(mergeDriverSetupLine({ status: 'skipped', command: BARE })).toBeNull();
    expect(mergeDriverSetupLine({ status: 'unchanged', command: BARE })).toBeNull();
    expect(mergeDriverSetupLine({ status: 'configured', command: BARE })).toBe(
      `Enabled the lessons.json merge driver for this clone (git config ${KEY} "${BARE}").`,
    );
    expect(mergeDriverSetupLine({ status: 'updated', command: BARE })).toBe(
      `Updated the lessons.json merge driver for this clone (git config ${KEY} "${BARE}").`,
    );
    expect(mergeDriverSetupLine({ status: 'custom', command: BARE, existing: 'x' })).toBe(
      `Kept your own lessons.json merge driver (${KEY} = "x"); the agentsmesh one is "${BARE}".`,
    );
    expect(mergeDriverSetupLine({ status: 'failed', command: BARE, reason: 'boom' })).toBe(
      'Could not enable the lessons.json merge driver: boom.',
    );
  });
});
