import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { settingsHandlers } from '../../../../src/mcp/handlers/settings.js';
import { parseHooks } from '../../../../src/canonical/features/hooks.js';
import { resolveContext } from '../../../../src/mcp/context.js';
import type { McpContext } from '../../../../src/mcp/context.js';

const isWin = platform() === 'win32';

let projectRoot: string;
let outsideDir: string;
let ctx: McpContext;

const BASELINE_YAML = `version: 1
targets:
  - claude-code
  - cursor
features:
  - rules
  - commands
`;

const BASELINE_MCP_JSON =
  JSON.stringify(
    {
      mcpServers: {
        'my-server': { command: 'node', args: ['server.js'], env: {}, type: 'stdio' },
      },
    },
    null,
    2,
  ) + '\n';

const BASELINE_PERMISSIONS_YAML = `allow:
  - Bash
  - Read
deny:
  - Write
ask: []
`;

const BASELINE_HOOKS_YAML = `PreToolUse:
  - matcher: Bash
    hooks:
      - type: command
        command: echo pre
`;

const BASELINE_IGNORE = `# Comment line
node_modules
dist
.env
`;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'settings-'));
  outsideDir = await mkdtemp(join(tmpdir(), 'settings-out-'));
  await mkdir(join(projectRoot, '.agentsmesh'), { recursive: true });
  await writeFile(join(projectRoot, 'agentsmesh.yaml'), BASELINE_YAML, 'utf8');
  await writeFile(join(projectRoot, '.agentsmesh/mcp.json'), BASELINE_MCP_JSON, 'utf8');
  await writeFile(
    join(projectRoot, '.agentsmesh/permissions.yaml'),
    BASELINE_PERMISSIONS_YAML,
    'utf8',
  );
  await writeFile(join(projectRoot, '.agentsmesh/hooks.yaml'), BASELINE_HOOKS_YAML, 'utf8');
  await writeFile(join(projectRoot, '.agentsmesh/ignore'), BASELINE_IGNORE, 'utf8');
  ctx = await resolveContext({ cwd: projectRoot });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
});

describe('settingsHandlers', () => {
  // ─── reads ───

  it('getConfig returns parsed yaml', async () => {
    const cfg = await settingsHandlers.getConfig(ctx);
    expect(cfg).toMatchObject({ version: 1, targets: ['claude-code', 'cursor'] });
  });

  it('getConfig throws NO_PROJECT if agentsmesh.yaml missing', async () => {
    await rm(join(projectRoot, 'agentsmesh.yaml'));
    await expect(settingsHandlers.getConfig(ctx)).rejects.toMatchObject({ code: 'NO_PROJECT' });
  });

  it('listMcpServers returns servers from .agentsmesh/mcp.json', async () => {
    const result = await settingsHandlers.listMcpServers(ctx);
    expect(result.servers).not.toBeNull();
    expect(result.servers?.['my-server']).toMatchObject({ command: 'node', args: ['server.js'] });
  });

  it('listMcpServers returns { servers: null } when mcp.json missing', async () => {
    await rm(join(projectRoot, '.agentsmesh/mcp.json'));
    const result = await settingsHandlers.listMcpServers(ctx);
    expect(result).toEqual({ servers: null });
  });

  it('getPermissions returns yaml content or null when missing', async () => {
    const perms = await settingsHandlers.getPermissions(ctx);
    expect(perms).toMatchObject({ allow: ['Bash', 'Read'], deny: ['Write'] });

    await rm(join(projectRoot, '.agentsmesh/permissions.yaml'));
    const none = await settingsHandlers.getPermissions(ctx);
    expect(none).toBeNull();
  });

  it('getHooks returns yaml content or null when missing', async () => {
    const hooks = await settingsHandlers.getHooks(ctx);
    expect(hooks).toMatchObject({ PreToolUse: expect.any(Array) });

    await rm(join(projectRoot, '.agentsmesh/hooks.yaml'));
    const none = await settingsHandlers.getHooks(ctx);
    expect(none).toBeNull();
  });

  it('getIgnore returns patterns array (skipping comments and blanks)', async () => {
    const result = await settingsHandlers.getIgnore(ctx);
    expect(result.patterns).toEqual(['node_modules', 'dist', '.env']);
  });

  it('getPermissions throws IO_ERROR on a non-ENOENT read failure', async () => {
    await rm(join(projectRoot, '.agentsmesh/permissions.yaml'));
    await mkdir(join(projectRoot, '.agentsmesh/permissions.yaml'), { recursive: true });
    await expect(settingsHandlers.getPermissions(ctx)).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('updateIgnore append starts from empty when the ignore file is absent', async () => {
    await rm(join(projectRoot, '.agentsmesh/ignore'));
    const r = await settingsHandlers.updateIgnore(ctx, { patterns: ['x.log'], mode: 'append' });
    expect(r.written).toBe(true);
    expect((await settingsHandlers.getIgnore(ctx)).patterns).toEqual(['x.log']);
  });

  // ─── symlink containment (reads must not escape the project) ───

  it.skipIf(isWin)(
    'getConfig rejects a symlinked agentsmesh.yaml escaping the project',
    async () => {
      await writeFile(join(outsideDir, 'secret.yaml'), 'leaked: true\n', 'utf8');
      await rm(join(projectRoot, 'agentsmesh.yaml'));
      await symlink(join(outsideDir, 'secret.yaml'), join(projectRoot, 'agentsmesh.yaml'));
      await expect(settingsHandlers.getConfig(ctx)).rejects.toMatchObject({
        code: 'PATH_TRAVERSAL',
      });
    },
  );

  it.skipIf(isWin)('listMcpServers rejects a symlinked mcp.json escaping the project', async () => {
    await writeFile(
      join(outsideDir, 'secret.json'),
      JSON.stringify({
        mcpServers: { leaked: { command: 'x', args: [], env: {}, type: 'stdio' } },
      }),
      'utf8',
    );
    await rm(join(projectRoot, '.agentsmesh/mcp.json'));
    await symlink(join(outsideDir, 'secret.json'), join(projectRoot, '.agentsmesh/mcp.json'));
    await expect(settingsHandlers.listMcpServers(ctx)).rejects.toMatchObject({
      code: 'PATH_TRAVERSAL',
    });
  });

  it.skipIf(isWin)(
    'getPermissions rejects a symlinked permissions.yaml escaping the project',
    async () => {
      await writeFile(join(outsideDir, 'secret.yaml'), 'allow: [Leaked]\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh/permissions.yaml'));
      await symlink(
        join(outsideDir, 'secret.yaml'),
        join(projectRoot, '.agentsmesh/permissions.yaml'),
      );
      await expect(settingsHandlers.getPermissions(ctx)).rejects.toMatchObject({
        code: 'PATH_TRAVERSAL',
      });
    },
  );

  it.skipIf(isWin)('getHooks rejects a symlinked hooks.yaml escaping the project', async () => {
    await writeFile(join(outsideDir, 'secret.yaml'), 'PreToolUse: []\n', 'utf8');
    await rm(join(projectRoot, '.agentsmesh/hooks.yaml'));
    await symlink(join(outsideDir, 'secret.yaml'), join(projectRoot, '.agentsmesh/hooks.yaml'));
    await expect(settingsHandlers.getHooks(ctx)).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });

  it.skipIf(isWin)('getIgnore rejects a symlinked ignore file escaping the project', async () => {
    await writeFile(join(outsideDir, 'secret'), 'leaked-pattern\n', 'utf8');
    await rm(join(projectRoot, '.agentsmesh/ignore'));
    await symlink(join(outsideDir, 'secret'), join(projectRoot, '.agentsmesh/ignore'));
    await expect(settingsHandlers.getIgnore(ctx)).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });

  it.skipIf(isWin)(
    'getPermissions rejects a symlinked .agentsmesh parent escaping the project',
    async () => {
      // Not a leaf symlink — the whole .agentsmesh dir points outside the project.
      await writeFile(join(outsideDir, 'permissions.yaml'), 'allow: [Leaked]\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh'), { recursive: true, force: true });
      await symlink(outsideDir, join(projectRoot, '.agentsmesh'), 'dir');
      await expect(settingsHandlers.getPermissions(ctx)).rejects.toMatchObject({
        code: 'PATH_TRAVERSAL',
      });
    },
  );

  // ─── symlink containment (writes/pre-reads must not escape the project) ───

  it.skipIf(isWin)(
    'updatePermissions rejects writes through a symlinked .agentsmesh (no out-of-tree escape)',
    async () => {
      await writeFile(join(outsideDir, 'permissions.yaml'), 'allow: [Original]\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh'), { recursive: true, force: true });
      await symlink(outsideDir, join(projectRoot, '.agentsmesh'), 'dir');
      await expect(
        settingsHandlers.updatePermissions(ctx, { allow: ['Attacker'] }),
      ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
      // The out-of-tree file must be untouched.
      expect(await readFile(join(outsideDir, 'permissions.yaml'), 'utf8')).toBe(
        'allow: [Original]\n',
      );
    },
  );

  it.skipIf(isWin)(
    'addMcpServer rejects writes through a symlinked .agentsmesh (no out-of-tree escape)',
    async () => {
      await writeFile(join(outsideDir, 'mcp.json'), '{"mcpServers":{}}\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh'), { recursive: true, force: true });
      await symlink(outsideDir, join(projectRoot, '.agentsmesh'), 'dir');
      await expect(
        settingsHandlers.addMcpServer(ctx, {
          name: 'evil',
          server: { command: 'x', args: [], env: {}, type: 'stdio' },
        }),
      ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
      expect(await readFile(join(outsideDir, 'mcp.json'), 'utf8')).toBe('{"mcpServers":{}}\n');
    },
  );

  it.skipIf(isWin)(
    'updateIgnore append does not read or persist through a symlinked ignore file',
    async () => {
      await writeFile(join(outsideDir, 'secret'), 'SECRET_OUTSIDE\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh/ignore'));
      await symlink(join(outsideDir, 'secret'), join(projectRoot, '.agentsmesh/ignore'));
      await expect(
        settingsHandlers.updateIgnore(ctx, { patterns: ['x'], mode: 'append' }),
      ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
      // The outside file is neither slurped nor overwritten.
      expect(await readFile(join(outsideDir, 'secret'), 'utf8')).toBe('SECRET_OUTSIDE\n');
    },
  );

  it.skipIf(isWin)(
    'updateConfig rejects writes through a symlinked agentsmesh.yaml (no out-of-tree escape)',
    async () => {
      await writeFile(join(outsideDir, 'victim.yaml'), 'version: 1\n', 'utf8');
      await rm(join(projectRoot, 'agentsmesh.yaml'));
      await symlink(join(outsideDir, 'victim.yaml'), join(projectRoot, 'agentsmesh.yaml'));
      await expect(
        settingsHandlers.updateConfig(ctx, { targets: ['claude-code'] }),
      ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
      expect(await readFile(join(outsideDir, 'victim.yaml'), 'utf8')).toBe('version: 1\n');
    },
  );

  it.skipIf(isWin)(
    'updateHooks rejects writes through a symlinked .agentsmesh (no out-of-tree escape)',
    async () => {
      await writeFile(join(outsideDir, 'hooks.yaml'), 'PreToolUse: []\n', 'utf8');
      await rm(join(projectRoot, '.agentsmesh'), { recursive: true, force: true });
      await symlink(outsideDir, join(projectRoot, '.agentsmesh'), 'dir');
      await expect(
        settingsHandlers.updateHooks(ctx, { hooks: { PostToolUse: [] } }),
      ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
      expect(await readFile(join(outsideDir, 'hooks.yaml'), 'utf8')).toBe('PreToolUse: []\n');
    },
  );

  // ─── updateConfig ───

  it('updateConfig replace mode: targets array overwritten', async () => {
    const r = await settingsHandlers.updateConfig(ctx, { targets: ['claude-code'] });
    expect(r.written).toBe(true);
    const written = await readFile(join(projectRoot, 'agentsmesh.yaml'), 'utf8');
    expect(written).toContain('claude-code');
    expect(written).not.toContain('cursor');
  });

  it('updateConfig merge: true unions + dedups targets array', async () => {
    // baseline has ['claude-code', 'cursor']
    const r = await settingsHandlers.updateConfig(ctx, {
      targets: ['cursor', 'gemini-cli'],
      merge: true,
    });
    expect(r.written).toBe(true);
    const written = await readFile(join(projectRoot, 'agentsmesh.yaml'), 'utf8');
    expect(written).toContain('claude-code');
    expect(written).toContain('cursor');
    expect(written).toContain('gemini-cli');
    // cursor should not be duplicated — count occurrences
    const cursorCount = (written.match(/cursor/g) ?? []).length;
    expect(cursorCount).toBe(1);
  });

  it('updateConfig rejects invalid target ID → VALIDATION_FAILED', async () => {
    await expect(
      settingsHandlers.updateConfig(ctx, { targets: ['not-a-real-target-xyz'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('updateConfig rejects forbidden filename → PATH_TRAVERSAL', async () => {
    await expect(
      settingsHandlers.updateConfig(ctx, {
        // @ts-expect-error intentional bad filename
        filename: 'agentsmesh.local.yaml',
      }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });

  it('updateConfig dry_run returns written: false and does not write to disk', async () => {
    const originalContent = await readFile(join(projectRoot, 'agentsmesh.yaml'), 'utf8');
    const r = await settingsHandlers.updateConfig(ctx, {
      targets: ['claude-code'],
      dry_run: true,
    });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, 'agentsmesh.yaml'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  // ─── MCP servers ───

  it('addMcpServer writes a new entry', async () => {
    const r = await settingsHandlers.addMcpServer(ctx, {
      name: 'new-server',
      server: { command: 'python', args: ['-m', 'server'], env: {}, type: 'stdio' },
    });
    expect(r.written).toBe(true);
    const raw = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers['new-server']).toMatchObject({ command: 'python' });
    expect(parsed.mcpServers['my-server']).toBeDefined();
  });

  it('addMcpServer throws ALREADY_EXISTS on duplicate name', async () => {
    await expect(
      settingsHandlers.addMcpServer(ctx, {
        name: 'my-server',
        server: { command: 'node', args: [], env: {}, type: 'stdio' },
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });

  it('updateMcpServer replace mode replaces server entry', async () => {
    const r = await settingsHandlers.updateMcpServer(ctx, {
      name: 'my-server',
      server: { command: 'bun', args: ['run', 'server.ts'], env: {}, type: 'stdio' },
    });
    expect(r.written).toBe(true);
    const raw = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, { command: string }> };
    expect(parsed.mcpServers['my-server'].command).toBe('bun');
  });

  it('updateMcpServer merge: true shallow-merges server entry', async () => {
    // Add an env field to existing server to verify merge keeps old fields
    const existing = JSON.parse(
      await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8'),
    ) as { mcpServers: Record<string, unknown> };
    (existing.mcpServers['my-server'] as Record<string, unknown>)['env'] = { FOO: 'bar' };
    await writeFile(
      join(projectRoot, '.agentsmesh/mcp.json'),
      JSON.stringify(existing, null, 2) + '\n',
      'utf8',
    );

    await settingsHandlers.updateMcpServer(ctx, {
      name: 'my-server',
      server: { env: { BAZ: 'qux' } } as Record<string, unknown>,
      merge: true,
    });
    const raw = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      mcpServers: Record<string, { command: string; env: Record<string, string> }>;
    };
    // command preserved from original, env replaced by merge input
    expect(parsed.mcpServers['my-server'].command).toBe('node');
    expect(parsed.mcpServers['my-server'].env).toMatchObject({ BAZ: 'qux' });
  });

  it('updateMcpServer throws NOT_FOUND for missing server', async () => {
    await expect(
      settingsHandlers.updateMcpServer(ctx, {
        name: 'no-such-server',
        server: { command: 'x', args: [], env: {}, type: 'stdio' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('removeMcpServer removes the named entry', async () => {
    const r = await settingsHandlers.removeMcpServer(ctx, { name: 'my-server' });
    expect(r.removed).toBe(true);
    const raw = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers['my-server']).toBeUndefined();
  });

  it('removeMcpServer throws NOT_FOUND for missing server', async () => {
    await expect(
      settingsHandlers.removeMcpServer(ctx, { name: 'no-such-server' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('removeMcpServer removing agentsmesh self-server succeeds (documented self-disable)', async () => {
    // Add an agentsmesh server entry first
    const raw = JSON.parse(await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    raw.mcpServers['agentsmesh'] = { command: 'agentsmesh', args: ['mcp'], env: {}, type: 'stdio' };
    await writeFile(
      join(projectRoot, '.agentsmesh/mcp.json'),
      JSON.stringify(raw, null, 2) + '\n',
      'utf8',
    );

    const r = await settingsHandlers.removeMcpServer(ctx, { name: 'agentsmesh' });
    expect(r.removed).toBe(true);
    const after = JSON.parse(await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(after.mcpServers['agentsmesh']).toBeUndefined();
  });

  // ─── permissions ───

  it('updatePermissions replace overwrites listed fields', async () => {
    const r = await settingsHandlers.updatePermissions(ctx, {
      allow: ['Glob'],
      deny: [],
    });
    expect(r.written).toBe(true);
    const written = await readFile(join(projectRoot, '.agentsmesh/permissions.yaml'), 'utf8');
    expect(written).toContain('Glob');
    expect(written).not.toContain('Bash');
  });

  it('updatePermissions writes only the given lists into a new file', async () => {
    for (const content of [null, '# allow:\n#   - Read\n']) {
      const path = join(projectRoot, '.agentsmesh/permissions.yaml');
      await rm(path, { force: true });
      if (content !== null) await writeFile(path, content, 'utf8');
      await settingsHandlers.updatePermissions(ctx, { allow: ['Glob'] });
      expect(parseYaml(await readFile(path, 'utf8'))).toEqual({ allow: ['Glob'] });
    }
  });

  it('updatePermissions append mode unions + dedups', async () => {
    // baseline allow: ['Bash', 'Read']
    await settingsHandlers.updatePermissions(ctx, {
      allow: ['Bash', 'Edit'],
      mode: 'append',
    });
    const written = await readFile(join(projectRoot, '.agentsmesh/permissions.yaml'), 'utf8');
    expect(written).toContain('Read');
    expect(written).toContain('Edit');
    // Bash should appear once only
    const bashCount = (written.match(/Bash/g) ?? []).length;
    expect(bashCount).toBe(1);
  });

  // ─── hooks ───

  it('updateHooks full-replace round-trip', async () => {
    const newHooks = {
      PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo post' }] }],
    };
    const r = await settingsHandlers.updateHooks(ctx, { hooks: newHooks as never });
    expect(r.written).toBe(true);
    const written = await readFile(join(projectRoot, '.agentsmesh/hooks.yaml'), 'utf8');
    expect(written).toContain('PostToolUse');
    expect(written).not.toContain('PreToolUse');
  });

  it('updateHooks normalizes the nested native form so parseHooks recovers it', async () => {
    // The nested {matcher, hooks:[{type, command}]} form is the shape a client
    // reads from Claude Code settings.json. Written verbatim it would be dropped
    // by parseHooks (canonical hooks are flat) — verify it survives round-trip.
    const nested = {
      PostToolUse: [
        {
          matcher: 'Write',
          hooks: [
            { type: 'command', command: 'echo a' },
            { type: 'command', command: 'echo b' },
          ],
        },
      ],
    };
    await settingsHandlers.updateHooks(ctx, { hooks: nested as never });
    const parsed = await parseHooks(join(projectRoot, '.agentsmesh/hooks.yaml'));
    expect(parsed).not.toBeNull();
    expect(parsed?.PostToolUse).toEqual([
      { matcher: 'Write', command: 'echo a', type: 'command' },
      { matcher: 'Write', command: 'echo b', type: 'command' },
    ]);
  });

  it('updateHooks preserves the already-flat form unchanged', async () => {
    const flat = {
      PreToolUse: [{ matcher: 'Bash', command: 'echo flat', type: 'command' }],
    };
    await settingsHandlers.updateHooks(ctx, { hooks: flat as never });
    const parsed = await parseHooks(join(projectRoot, '.agentsmesh/hooks.yaml'));
    expect(parsed?.PreToolUse).toEqual([
      { matcher: 'Bash', command: 'echo flat', type: 'command' },
    ]);
  });

  // ─── ignore ───

  it('updateIgnore replace mode replaces patterns', async () => {
    const r = await settingsHandlers.updateIgnore(ctx, { patterns: ['*.log', 'tmp/'] });
    expect(r.written).toBe(true);
    const written = await readFile(join(projectRoot, '.agentsmesh/ignore'), 'utf8');
    expect(written).toContain('*.log');
    expect(written).toContain('tmp/');
    expect(written).not.toContain('node_modules');
  });

  it('updateIgnore append mode unions + dedups existing patterns', async () => {
    // baseline has node_modules, dist, .env
    await settingsHandlers.updateIgnore(ctx, {
      patterns: ['node_modules', '*.log'],
      mode: 'append',
    });
    const result = await settingsHandlers.getIgnore(ctx);
    expect(result.patterns).toContain('node_modules');
    expect(result.patterns).toContain('dist');
    expect(result.patterns).toContain('*.log');
    // node_modules should not be duplicated
    const count = (result.patterns ?? []).filter((p) => p === 'node_modules').length;
    expect(count).toBe(1);
  });

  // ─── dry_run for remaining mutations ───

  it('addMcpServer dry_run returns written: false without writing', async () => {
    const originalContent = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const r = await settingsHandlers.addMcpServer(ctx, {
      name: 'dry-server',
      server: { command: 'echo', args: [], env: {}, type: 'stdio' },
      dry_run: true,
    });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  it('removeMcpServer dry_run returns removed: false without writing', async () => {
    const r = await settingsHandlers.removeMcpServer(ctx, { name: 'my-server', dry_run: true });
    expect(r.removed).toBe(false);
    const raw = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers['my-server']).toBeDefined();
  });

  it('rejects a write whose content exceeds the 1 MiB cap', async () => {
    await expect(
      settingsHandlers.updateIgnore(ctx, { patterns: ['x'.repeat(1024 * 1024 + 16)] }),
    ).rejects.toThrow(/LIMIT_EXCEEDED|1 MiB/);
  });

  it('updatePermissions append mode unions new entries with the existing list', async () => {
    const r = await settingsHandlers.updatePermissions(ctx, { allow: ['NewTool'], mode: 'append' });
    expect(r.written).toBe(true);
    const after = await readFile(join(projectRoot, '.agentsmesh/permissions.yaml'), 'utf8');
    expect(after).toContain('NewTool');
  });

  it('updatePermissions dry_run returns written: false without writing', async () => {
    const originalContent = await readFile(
      join(projectRoot, '.agentsmesh/permissions.yaml'),
      'utf8',
    );
    const r = await settingsHandlers.updatePermissions(ctx, {
      allow: ['NewTool'],
      dry_run: true,
    });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, '.agentsmesh/permissions.yaml'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  it('updateHooks dry_run returns written: false without writing', async () => {
    const originalContent = await readFile(join(projectRoot, '.agentsmesh/hooks.yaml'), 'utf8');
    const r = await settingsHandlers.updateHooks(ctx, {
      hooks: { PostToolUse: [] },
      dry_run: true,
    });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, '.agentsmesh/hooks.yaml'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  it('updateIgnore dry_run returns written: false without writing', async () => {
    const originalContent = await readFile(join(projectRoot, '.agentsmesh/ignore'), 'utf8');
    const r = await settingsHandlers.updateIgnore(ctx, { patterns: ['dry'], dry_run: true });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, '.agentsmesh/ignore'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  it('getIgnore returns { patterns: null } when ignore file missing', async () => {
    await rm(join(projectRoot, '.agentsmesh/ignore'));
    const result = await settingsHandlers.getIgnore(ctx);
    expect(result).toEqual({ patterns: null });
  });

  it('updateMcpServer dry_run returns written: false without writing', async () => {
    const originalContent = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    const r = await settingsHandlers.updateMcpServer(ctx, {
      name: 'my-server',
      server: { command: 'changed', args: [], env: {}, type: 'stdio' },
      dry_run: true,
    });
    expect(r.written).toBe(false);
    const afterContent = await readFile(join(projectRoot, '.agentsmesh/mcp.json'), 'utf8');
    expect(afterContent).toBe(originalContent);
  });
});
