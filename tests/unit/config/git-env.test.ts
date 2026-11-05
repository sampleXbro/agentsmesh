import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_LOCAL_GIT_ENV, remoteGitEnv } from '../../../src/config/remote/git-env.js';
import { clearEnv } from '../../helpers/temp-git-repo.js';

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = clearEnv([
    ...REPO_LOCAL_GIT_ENV,
    'AGENTSMESH_ALLOW_INSECURE_GIT',
    'AGENTSMESH_ALLOW_LOCAL_GIT',
  ]);
});

afterEach(() => restoreEnv());

describe('remoteGitEnv', () => {
  it('drops the caller repo vars, keeps the rest, and leaves process.env alone', () => {
    for (const key of REPO_LOCAL_GIT_ENV) process.env[key] = '/hook/.git';

    const env = remoteGitEnv();

    expect(REPO_LOCAL_GIT_ENV.filter((key) => key in env)).toEqual([]);
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.GIT_CONFIG_COUNT).toBe(process.env.GIT_CONFIG_COUNT);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_ALLOW_PROTOCOL).toBe('https:ssh');
    expect(process.env.GIT_DIR).toBe('/hook/.git');
  });

  it('widens GIT_ALLOW_PROTOCOL with the transport opt-ins', () => {
    process.env.AGENTSMESH_ALLOW_INSECURE_GIT = '1';
    process.env.AGENTSMESH_ALLOW_LOCAL_GIT = '1';
    expect(remoteGitEnv().GIT_ALLOW_PROTOCOL).toBe('https:ssh:http:file');
  });
});

describe('test setup isolation', () => {
  // The setup file runs before any vi.mock, so a product import there would
  // load real modules that a later test could no longer stub.
  it('loads the env list from a module that imports nothing', () => {
    const list = readFileSync('src/config/remote/repo-local-git-env.ts', 'utf-8');
    const setup = readFileSync('tests/setup/isolate-git-env.ts', 'utf-8');

    expect(list).not.toMatch(/^import /m);
    expect(setup.match(/^import .*$/gm)).toEqual([
      "import { REPO_LOCAL_GIT_ENV } from '../../src/config/remote/repo-local-git-env.js';",
    ]);
  });
});
