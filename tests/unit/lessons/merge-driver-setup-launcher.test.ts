/**
 * The driver is saved only when git can start it later. A driver git cannot
 * start leaves our side with no conflict markers, and `git add` then drops the
 * other branch's lessons. Two ways it slipped through:
 *  - `npx agentsmesh ...` puts its cache bin folder first on PATH, so a bare
 *    `agentsmesh` driver looked launchable but git cannot find it later;
 *  - git runs the driver from the repository root, where
 *    `npx --no --offline agentsmesh` cannot see a subpackage's own install.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runGit } from '../../../src/lessons/git-exec.js';
import { ensureLessonsMergeDriver } from '../../../src/lessons/merge-driver-setup.js';
import { isolateGit } from '../../helpers/lessons-merge-repo.js';
import { initRepo, writeFile } from '../../helpers/temp-git-repo.js';

const KEY = 'merge.agentsmesh-lessons.driver';
const BARE = 'agentsmesh lessons merge-driver %O %A %B';
const LOCAL_FIRST = 'npx --no --offline agentsmesh lessons merge-driver %O %A %B';
const ATTRIBUTE = '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons\n';
const DEPENDS = JSON.stringify({ devDependencies: { agentsmesh: '^1.0.0' } });

let restoreEnv: () => void;
let root: string;
let tools: string;

/** A folder holding empty stand-ins for `names`. */
function binDir(dir: string, names: readonly string[]): string {
  mkdirSync(dir, { recursive: true });
  for (const name of names) writeFileSync(join(dir, name), '');
  return dir;
}
const pathOf = (...dirs: string[]): NodeJS.ProcessEnv => ({ PATH: dirs.join(delimiter) });
const driverConfig = (): string | null => {
  const r = runGit(root, ['config', '--local', '--get', KEY]);
  return r.status === 0 ? r.stdout.trim() : null;
};

beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-driver-launcher-'));
  tools = mkdtempSync(join(tmpdir(), 'am-driver-tools-'));
  initRepo(root);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(tools, { recursive: true, force: true });
});

describe('ensureLessonsMergeDriver — a launcher git can find later', () => {
  it('refuses a bare driver found only in the npx cache that `npx agentsmesh` put on PATH', () => {
    writeFile(root, '.gitattributes', ATTRIBUTE);
    const npxCache = binDir(join(tools, '.npm', '_npx', 'f00d', 'node_modules', '.bin'), [
      'agentsmesh',
      'agentsmesh.cmd',
    ]);
    const setup = ensureLessonsMergeDriver(root, { env: pathOf(npxCache) });
    expect(setup).toEqual({
      status: 'failed',
      command: BARE,
      reason:
        '`agentsmesh` is not installed on PATH (npx and package-script bin folders do not ' +
        'count), so git could not start the driver; install agentsmesh globally or as a ' +
        'project devDependency',
    });
    expect(driverConfig()).toBeNull();
  });

  it('refuses the npx driver when agentsmesh is installed only in a subpackage', () => {
    const app = join(root, 'packages', 'app');
    writeFile(app, '.gitattributes', ATTRIBUTE);
    writeFile(app, 'package.json', DEPENDS);
    binDir(join(app, 'node_modules', '.bin'), ['agentsmesh', 'agentsmesh.cmd']);
    const npx = binDir(join(tools, 'node'), ['npx', 'npx.cmd']);
    const setup = ensureLessonsMergeDriver(app, { env: pathOf(npx) });
    expect(setup).toEqual({
      status: 'failed',
      command: LOCAL_FIRST,
      reason:
        'git runs the driver from the repository root ' +
        `(${realpathSync(root).replaceAll('\\', '/')}), where ` +
        '`npx --no --offline agentsmesh` cannot find agentsmesh; add agentsmesh to the ' +
        'devDependencies of the root package.json and install, or install agentsmesh globally',
    });
    expect(driverConfig()).toBeNull();
  });

  it('saves the npx driver when agentsmesh resolves from the repository root', () => {
    const app = join(root, 'packages', 'app');
    writeFile(app, '.gitattributes', ATTRIBUTE);
    writeFile(app, 'package.json', DEPENDS);
    binDir(join(root, 'node_modules', '.bin'), ['agentsmesh', 'agentsmesh.cmd']);
    const npx = binDir(join(tools, 'node'), ['npx', 'npx.cmd']);
    expect(ensureLessonsMergeDriver(app, { env: pathOf(npx) })).toEqual({
      status: 'configured',
      command: LOCAL_FIRST,
    });
    expect(driverConfig()).toBe(LOCAL_FIRST);
  });

  it('saves the npx driver when agentsmesh is installed globally', () => {
    writeFile(root, '.gitattributes', ATTRIBUTE);
    writeFile(root, 'package.json', DEPENDS);
    const global = binDir(join(tools, 'global'), [
      'npx',
      'npx.cmd',
      'agentsmesh',
      'agentsmesh.cmd',
    ]);
    expect(ensureLessonsMergeDriver(root, { env: pathOf(global) }).status).toBe('configured');
    expect(driverConfig()).toBe(LOCAL_FIRST);
  });

  it('refuses the npx driver when npx itself is missing', () => {
    writeFile(root, '.gitattributes', ATTRIBUTE);
    writeFile(root, 'package.json', DEPENDS);
    binDir(join(root, 'node_modules', '.bin'), ['agentsmesh', 'agentsmesh.cmd']);
    const setup = ensureLessonsMergeDriver(root, { env: pathOf(join(tools, 'none')) });
    expect(setup.status).toBe('failed');
    expect(setup.status === 'failed' && setup.reason).toBe(
      '`npx` is not installed on PATH (npx and package-script bin folders do not count), so git ' +
        'could not start the driver; install agentsmesh globally or as a project devDependency',
    );
    expect(driverConfig()).toBeNull();
  });
});
