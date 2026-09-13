/**
 * A token embedded in a `git+https://user:token@host/...` source must never be
 * written to a file the team commits, nor become part of a cache directory
 * name. Transport keeps the credential; everything persisted drops it.
 */

import { describe, expect, it } from 'vitest';
import { stripUrlCredentials } from '../../../src/utils/output/redact-url-secrets.js';
import { buildCacheKey } from '../../../src/config/remote/remote-fetcher.js';

const TOKEN = 'ghp_SECRET123';

describe('stripUrlCredentials', () => {
  it('removes userinfo from an https URL', () => {
    expect(stripUrlCredentials(`https://x-access-token:${TOKEN}@github.com/acme/repo.git`)).toBe(
      'https://github.com/acme/repo.git',
    );
  });

  it('removes a bare username', () => {
    expect(stripUrlCredentials('https://someone@gitlab.com/org/repo.git')).toBe(
      'https://gitlab.com/org/repo.git',
    );
  });

  it('leaves a URL without userinfo untouched', () => {
    expect(stripUrlCredentials('https://github.com/acme/repo.git')).toBe(
      'https://github.com/acme/repo.git',
    );
  });

  it('leaves an scp-style ssh source untouched', () => {
    expect(stripUrlCredentials('git@github.com:acme/repo.git')).toBe(
      'git@github.com:acme/repo.git',
    );
  });

  it('keeps the ref fragment', () => {
    expect(stripUrlCredentials(`https://u:${TOKEN}@github.com/acme/repo.git#main`)).toBe(
      'https://github.com/acme/repo.git#main',
    );
  });
});

describe('buildCacheKey', () => {
  it('never embeds a credential in the directory name', () => {
    const key = buildCacheKey('git', `https://u:${TOKEN}@github.com/acme/repo.git`, 'main');
    expect(key).not.toContain(TOKEN);
    expect(key).not.toContain('u_');
  });

  it('resolves the same repo to one cache entry whether or not a token is present', () => {
    const withToken = buildCacheKey('git', `https://u:${TOKEN}@github.com/acme/repo.git`, 'main');
    const without = buildCacheKey('git', 'https://github.com/acme/repo.git', 'main');
    expect(withToken).toBe(without);
  });

  it('still separates different repositories', () => {
    expect(buildCacheKey('git', 'https://github.com/acme/one.git', 'main')).not.toBe(
      buildCacheKey('git', 'https://github.com/acme/two.git', 'main'),
    );
  });
});
