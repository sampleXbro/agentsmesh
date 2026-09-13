import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { runCheck } from '../../src/cli/commands/check.js';
import { readLock } from '../../src/config/core/lock.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-claude-revocation-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const foreignSettings = {
  model: 'user-model',
  env: { USER_SETTING: 'keep' },
  permissions: { defaultMode: 'default', additionalDirectories: ['../shared'] },
};
const foreignMcp = { projects: { '/example': { history: ['keep'] } }, userSetting: 'keep' };

async function setup(scope: 'project' | 'global'): Promise<{
  canonicalDir: string;
  mcpPath: string;
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
    'version: 1\ntargets: [claude-code]\nfeatures: [permissions, hooks, mcp]\n',
  );
  const mcpPath = scope === 'global' ? '.claude.json' : '.mcp.json';
  await writeFile(join(root, '.claude/settings.json'), JSON.stringify(foreignSettings));
  await writeFile(join(root, mcpPath), JSON.stringify(foreignMcp));
  return { canonicalDir, mcpPath, flags: scope === 'global' ? { global: true } : {} };
}

describe.each(['project', 'global'] as const)('Claude empty revocation (%s)', (scope) => {
  it('revokes the final permission, hook, and server while preserving foreign settings', async () => {
    const { canonicalDir, mcpPath, flags } = await setup(scope);
    await writeFile(join(canonicalDir, 'permissions.yaml'), 'allow: ["Bash(*)"]\ndeny: []\n');
    await writeFile(
      join(canonicalDir, 'hooks.yaml'),
      'PreToolUse:\n  - matcher: "*"\n    command: echo old\n    type: command\n',
    );
    await writeFile(
      join(canonicalDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { old: { command: 'node', args: ['old.js'] } } }),
    );
    await runGenerate(flags, root, { printMatrix: false });

    await writeFile(join(canonicalDir, 'permissions.yaml'), 'allow: []\ndeny: []\nask: []\n');
    await writeFile(join(canonicalDir, 'hooks.yaml'), '{}\n');
    await writeFile(join(canonicalDir, 'mcp.json'), '{"mcpServers":{}}\n');
    expect((await runGenerate({ ...flags, check: true }, root)).exitCode).toBe(1);
    const generated = await runGenerate(flags, root, { printMatrix: false });

    const outputPaths = ['.claude/settings.json', mcpPath].sort();
    expect(generated.data.files.map((file) => file.path).sort()).toEqual(outputPaths);
    expect(JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'))).toEqual({
      ...foreignSettings,
      permissions: { ...foreignSettings.permissions, allow: [], deny: [], ask: [] },
      hooks: {},
    });
    expect(JSON.parse(await readFile(join(root, mcpPath), 'utf8'))).toEqual({
      ...foreignMcp,
      mcpServers: {},
    });
    expect(Object.keys((await readLock(canonicalDir))?.outputs ?? {}).sort()).toEqual(outputPaths);
    expect((await runCheck(flags, root)).exitCode).toBe(0);
    expect((await runGenerate({ ...flags, check: true }, root)).exitCode).toBe(0);
  });

  it('preserves foreign permission, hook, and server entries when canonical files are absent', async () => {
    const { mcpPath, flags } = await setup(scope);
    const settings = JSON.stringify({
      ...foreignSettings,
      permissions: { ...foreignSettings.permissions, allow: ['Read(*)'] },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user' }] }] },
    });
    const mcp = JSON.stringify({ ...foreignMcp, mcpServers: { user: { command: 'user-server' } } });
    await writeFile(join(root, '.claude/settings.json'), settings);
    await writeFile(join(root, mcpPath), mcp);

    const generated = await runGenerate(flags, root, { printMatrix: false });

    expect(generated.data.files).toEqual([]);
    expect(await readFile(join(root, '.claude/settings.json'), 'utf8')).toBe(settings);
    expect(await readFile(join(root, mcpPath), 'utf8')).toBe(mcp);
  });
});
