import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFileOptions = { env?: NodeJS.ProcessEnv };
type ExecFileLike = (
  file: string,
  args: string[],
  options: ExecFileOptions,
  callback: ExecFileCallback,
) => void;

const execFileMock = vi.hoisted(() => vi.fn<ExecFileLike>());

vi.mock('node:util', () => ({
  promisify: (fn: ExecFileLike) => {
    return (file: string, args: string[], options: ExecFileOptions) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        fn(file, args, options, (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        });
      });
  },
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import {
  gitLsRemoteResolve,
  isGitAvailable,
  resolveRemoteRefForInstall,
} from '../../../src/install/source/git-pin.js';

function queueGitSuccess(stdout: string): void {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _options: ExecFileOptions, callback: ExecFileCallback) => {
      callback(null, stdout, '');
    },
  );
}

function queueGitFailure(message: string): void {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _options: ExecFileOptions, callback: ExecFileCallback) => {
      callback(new Error(message), '', '');
    },
  );
}

describe('git pin helpers', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    // Isolate the transport opt-ins: without this the rejection test reads the
    // ambient shell and stops locking the contract when a dev has them set.
    delete process.env.AGENTSMESH_ALLOW_INSECURE_GIT;
    delete process.env.AGENTSMESH_ALLOW_LOCAL_GIT;
  });

  afterEach(() => {
    delete process.env.AGENTSMESH_ALLOW_INSECURE_GIT;
    delete process.env.AGENTSMESH_ALLOW_LOCAL_GIT;
  });

  it('reports whether git is available', async () => {
    queueGitSuccess('git version 2.39.0\n');
    await expect(isGitAvailable()).resolves.toBe(true);

    queueGitFailure('spawn git ENOENT');
    await expect(isGitAvailable()).resolves.toBe(false);
  });

  it('tries raw, heads, and tags refs until it finds a valid sha', async () => {
    queueGitSuccess('\n');
    queueGitSuccess('not-a-sha\trefs/heads/release\n');
    queueGitSuccess('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD\trefs/tags/release\n');

    await expect(gitLsRemoteResolve('https://example.com/org/repo.git', 'release')).resolves.toBe(
      'ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
    );

    expect(execFileMock.mock.calls.map((call) => call[1])).toEqual([
      ['ls-remote', 'https://example.com/org/repo.git', 'release'],
      ['ls-remote', 'https://example.com/org/repo.git', 'refs/heads/release'],
      ['ls-remote', 'https://example.com/org/repo.git', 'refs/tags/release'],
    ]);
  });

  it('throws with the last git error context when all remote ref attempts fail', async () => {
    queueGitFailure('network down');
    queueGitSuccess('\n');
    queueGitSuccess('still-not-a-sha\trefs/tags/release\n');

    await expect(gitLsRemoteResolve('https://example.com/org/repo.git', 'release')).rejects.toThrow(
      'network down',
    );
  });

  it('normalizes direct commit shas without shelling out', async () => {
    await expect(
      resolveRemoteRefForInstall('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD', 'unused'),
    ).resolves.toBe('abcdefabcdefabcdefabcdefabcdefabcdefabcd');

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('resolves HEAD and validates the returned ls-remote line', async () => {
    queueGitSuccess('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD\tHEAD\n');

    await expect(resolveRemoteRefForInstall('', 'https://example.com/org/repo.git')).resolves.toBe(
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );

    queueGitSuccess('not-a-sha\tHEAD\n');
    await expect(
      resolveRemoteRefForInstall('HEAD', 'https://example.com/org/repo.git'),
    ).rejects.toThrow(/Invalid ls-remote HEAD line/);
  });

  it('throws error when HEAD cannot be resolved', async () => {
    queueGitSuccess('\n'); // Empty output

    await expect(
      resolveRemoteRefForInstall('HEAD', 'https://example.com/org/repo.git'),
    ).rejects.toThrow('Could not resolve HEAD for https://example.com/org/repo.git');
  });

  it('rejects http/file/git transports before spawning git (SSRF / local-probe guard)', async () => {
    for (const url of ['http://169.254.169.254/latest', 'file:///tmp/secret', 'git://evil/x']) {
      await expect(gitLsRemoteResolve(url, 'main')).rejects.toThrow(/disallowed transport/i);
      await expect(resolveRemoteRefForInstall('main', url)).rejects.toThrow(
        /disallowed transport/i,
      );
    }
    // scp-style URLs are not parseable as URLs and are likewise refused.
    await expect(resolveRemoteRefForInstall('main', 'git@evil.com:org/repo')).rejects.toThrow(
      /disallowed transport/i,
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('sets GIT_ALLOW_PROTOCOL=https:ssh on the spawned git process by default', async () => {
    queueGitSuccess('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD\tHEAD\n');
    await resolveRemoteRefForInstall('', 'https://example.com/org/repo.git');
    expect(execFileMock.mock.calls[0]?.[2]?.env?.GIT_ALLOW_PROTOCOL).toBe('https:ssh');
  });

  it('widens GIT_ALLOW_PROTOCOL when the insecure opt-in is set', async () => {
    process.env.AGENTSMESH_ALLOW_INSECURE_GIT = '1';
    queueGitSuccess('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD\tHEAD\n');
    await resolveRemoteRefForInstall('', 'https://example.com/org/repo.git');
    expect(execFileMock.mock.calls[0]?.[2]?.env?.GIT_ALLOW_PROTOCOL).toBe('https:ssh:http');
  });

  it("drops a git hook's repo vars from the spawned git env", async () => {
    process.env.GIT_DIR = '/hook/.git/worktrees/wt';
    process.env.GIT_INDEX_FILE = '/hook/.git/worktrees/wt/index';
    try {
      queueGitSuccess('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD\tHEAD\n');
      await resolveRemoteRefForInstall('', 'https://example.com/org/repo.git');
      const env = execFileMock.mock.calls[0]?.[2]?.env ?? {};
      expect(env.GIT_TERMINAL_PROMPT).toBe('0');
      expect(['GIT_DIR', 'GIT_INDEX_FILE'].filter((key) => key in env)).toEqual([]);
    } finally {
      delete process.env.GIT_DIR;
      delete process.env.GIT_INDEX_FILE;
    }
  });

  it('still resolves a direct sha for any remoteUrl without validating it', async () => {
    await expect(
      resolveRemoteRefForInstall('ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD', 'file:///whatever'),
    ).resolves.toBe('abcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
