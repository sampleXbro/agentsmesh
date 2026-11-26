/**
 * An unknown flag must stop the run before any handler acts on it. A typo such
 * as `--dryrun` used to be dropped silently and the command ran for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../../src/cli/index.js';
import { CliUsageError } from '../../../src/cli/cli-error.js';
import { cmdHandlers } from '../../../src/cli/command-handlers.js';
import { unmuteLogger } from '../../../src/utils/output/logger.js';

const INDEX_PATH = fileURLToPath(new URL('../../../src/cli/index.ts', import.meta.url));

let stdout: string[];
let stderr: string[];
let argv: string[];
let cwd: string;
let work: string;
let exitSpy: MockInstance<typeof process.exit>;

beforeEach(async () => {
  stdout = [];
  stderr = [];
  argv = [...process.argv];
  cwd = process.cwd();
  // An empty dir: if a handler ever ran, it could not touch the repo.
  work = await mkdtemp(join(tmpdir(), 'am-flags-'));
  process.chdir(work);
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.resetModules();
});

afterEach(async () => {
  process.argv = argv;
  process.chdir(cwd);
  unmuteLogger();
  vi.restoreAllMocks();
  await rm(work, { recursive: true, force: true });
});

describe('main with an unknown flag', () => {
  it('rejects with a usage error before the handler runs', async () => {
    const handler = vi.spyOn(cmdHandlers, 'generate');
    const err = await main({ command: 'generate', flags: { dryrun: true }, args: [] }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CliUsageError);
    expect((err as Error).message).toBe(
      'Unknown flag --dryrun for `generate`. Did you mean --dry-run?',
    );
    expect(handler).not.toHaveBeenCalled();
    expect(await readdir(work)).toEqual([]);
  });

  it.each(['init', 'import', 'convert', 'install', 'installs', 'uninstall', 'refresh', 'diff'])(
    'rejects an unknown flag for %s',
    async (command) => {
      await expect(main({ command, flags: { zzzzzz: true }, args: [] })).rejects.toThrow(
        `Unknown flag --zzzzzz for \`${command}\`.`,
      );
    },
  );

  it.each(['lint', 'watch', 'check', 'merge', 'matrix', 'target', 'plugin'])(
    'rejects an unknown flag for %s',
    async (command) => {
      await expect(main({ command, flags: { zzzzzz: true }, args: [] })).rejects.toThrow(
        `Unknown flag --zzzzzz for \`${command}\`.`,
      );
    },
  );

  it('still prints command help when --help comes with an unknown flag', async () => {
    await main({ command: 'generate', flags: { dryrun: true, help: true }, args: [] });
    expect(stdout.join('')).toContain('agentsmesh generate [flags]');
  });

  it('reports an unknown command before an unknown flag', async () => {
    await expect(
      main({ command: 'no-such-command', flags: { zzzzzz: true }, args: [] }),
    ).rejects.toThrow('Unknown command "no-such-command"');
  });

  it('leaves lessons flags to the lessons validator', async () => {
    await main({ command: 'lessons', flags: { zzzzzz: true, json: true }, args: ['topics'] });
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      success: false,
      command: 'lessons',
      error: expect.stringContaining('Unknown flag --zzzzzz for `lessons topics`.'),
    });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('cli entry block with an unknown flag', () => {
  it('exits 2 and prints the message on stderr', async () => {
    process.argv = ['node', INDEX_PATH, 'generate', '--dryrun'];
    await import('../../../src/cli/index.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(2));
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toContain(
      'Unknown flag --dryrun for `generate`. Did you mean --dry-run?',
    );
    expect(await readdir(work)).toEqual([]);
  });

  it('exits 2 with a failure envelope on stdout when --json is set', async () => {
    process.argv = ['node', INDEX_PATH, 'generate', '--dryrun', '--json'];
    await import('../../../src/cli/index.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(2));
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      success: false,
      command: 'generate',
      error: 'Unknown flag --dryrun for `generate`. Did you mean --dry-run?',
    });
    expect(stderr).toEqual([]);
  });
});
