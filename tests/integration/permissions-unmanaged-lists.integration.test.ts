import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { TEMPLATE_PERMISSIONS } from '../../src/cli/commands/init-templates.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-perm-unmanaged-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const userSettings = {
  model: 'user-model',
  permissions: {
    allow: ['Bash(ls)'],
    deny: ['Bash(rm)'],
    ask: ['Write'],
    defaultMode: 'plan',
  },
};

/** The init template with only the `allow` block uncommented. */
function templateWithAllowOnly(): string {
  const commented =
    '# allow:\n#   - Bash(npm run:*)\n#   - Bash(git add:*)\n#   - Bash(git commit:*)\n';
  expect(TEMPLATE_PERMISSIONS).toContain(commented);
  return TEMPLATE_PERMISSIONS.replace(
    commented,
    'allow:\n  - Bash(npm run:*)\n  - Bash(git add:*)\n  - Bash(git commit:*)\n',
  );
}

async function setup(scope: 'project' | 'global'): Promise<{
  canonicalDir: string;
  flags: Record<string, string | boolean>;
}> {
  const canonicalDir = join(root, '.agentsmesh');
  await mkdir(canonicalDir);
  await mkdir(join(root, '.claude'));
  if (scope === 'global') {
    vi.stubEnv('HOME', root);
    vi.stubEnv('USERPROFILE', root);
  }
  const configDir = scope === 'global' ? canonicalDir : root;
  await writeFile(
    join(configDir, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [permissions]\n',
  );
  await writeFile(join(root, '.claude/settings.json'), JSON.stringify(userSettings));
  return { canonicalDir, flags: scope === 'global' ? { global: true } : {} };
}

async function readSettings(): Promise<unknown> {
  return JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
}

describe.each(['project', 'global'] as const)('unmanaged permission lists (%s)', (scope) => {
  it('leaves deny and ask alone when the template has only allow uncommented', async () => {
    const { canonicalDir, flags } = await setup(scope);
    await writeFile(join(canonicalDir, 'permissions.yaml'), templateWithAllowOnly());

    const generated = await runGenerate(flags, root, { printMatrix: false });

    expect(generated.data.files.map((file) => file.path)).toEqual(['.claude/settings.json']);
    expect(await readSettings()).toEqual({
      ...userSettings,
      permissions: {
        ...userSettings.permissions,
        allow: ['Bash(npm run:*)', 'Bash(git add:*)', 'Bash(git commit:*)'],
      },
    });
    expect((await runCheck(flags, root)).exitCode).toBe(0);
    expect((await runGenerate({ ...flags, check: true }, root)).exitCode).toBe(0);
  });

  it('revokes a managed list with [] and still keeps the unmanaged ones', async () => {
    const { canonicalDir, flags } = await setup(scope);
    await writeFile(join(canonicalDir, 'permissions.yaml'), 'deny: []\n');

    await runGenerate(flags, root, { printMatrix: false });

    expect(await readSettings()).toEqual({
      ...userSettings,
      permissions: { ...userSettings.permissions, deny: [] },
    });
  });

  it('does not add an ask list the user never had', async () => {
    const { canonicalDir, flags } = await setup(scope);
    const { ask: _ask, ...withoutAsk } = userSettings.permissions;
    await writeFile(
      join(root, '.claude/settings.json'),
      JSON.stringify({ ...userSettings, permissions: withoutAsk }),
    );
    await writeFile(join(canonicalDir, 'permissions.yaml'), 'allow:\n  - Read\n');

    await runGenerate(flags, root, { printMatrix: false });

    expect(await readSettings()).toEqual({
      ...userSettings,
      permissions: { ...withoutAsk, allow: ['Read'] },
    });
  });
});
