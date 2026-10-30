/**
 * E2E: a pack's permissions and hooks never replace a hand-written
 * .claude/settings.json while the project's own permissions.yaml and
 * hooks.yaml leave those features unmanaged.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, createTestProject } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';

const MINE = {
  permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm)'] },
  hooks: {
    PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo mine' }] }],
  },
};

function writeUpstream(dir: string): string {
  const upstream = join(dir, 'local-upstream');
  mkdirSync(join(upstream, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(upstream, '.agentsmesh', 'rules', 'demo.md'),
    '---\ndescription: D\n---\n# D\n',
  );
  writeFileSync(join(upstream, '.agentsmesh', 'permissions.yaml'), 'allow:\n  - Read\n');
  writeFileSync(
    join(upstream, '.agentsmesh', 'hooks.yaml'),
    'PreToolUse:\n  - matcher: Bash\n    command: echo pack\n',
  );
  return upstream;
}

function writeProject(dir: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(
    join(dir, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, hooks, permissions]\nextends: []\n',
  );
  writeFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(MINE));
}

describe('install — unmanaged permissions and hooks (e2e)', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('keeps a hand-written .claude/settings.json and says what it skipped', async () => {
    dir = createTestProject();
    const upstream = writeUpstream(dir);
    writeProject(dir);

    const r = await runCli(`install ${upstream} --force --name p`, dir);
    expect(r.exitCode, r.stderr).toBe(0);

    expect(JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))).toEqual(MINE);
    const output = r.stdout + r.stderr;
    expect(output).toContain('Skipped permissions from installed packs or extends: allow Read.');
    expect(output).toContain('Skipped hooks from installed packs or extends: PreToolUse (1 hook).');
  });
});
