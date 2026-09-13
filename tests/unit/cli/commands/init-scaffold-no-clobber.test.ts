import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeScaffoldFull } from '../../../../src/cli/commands/init-scaffold.js';

vi.mock('../../../../src/utils/output/logger.js', () => ({
  logger: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let canonicalDir: string;
beforeEach(async () => {
  canonicalDir = join(await mkdtemp(join(tmpdir(), 'am-init-scaffold-')), '.agentsmesh');
  await mkdir(canonicalDir, { recursive: true });
});
afterEach(async () => {
  await rm(join(canonicalDir, '..'), { recursive: true, force: true });
});

describe('writeScaffoldFull', () => {
  it('creates the full scaffold in an empty canonical directory', async () => {
    await writeScaffoldFull(canonicalDir);

    expect(await readFile(join(canonicalDir, 'rules/_root.md'), 'utf8')).not.toBe('');
    expect(await readFile(join(canonicalDir, 'mcp.json'), 'utf8')).not.toBe('');
    expect(await readFile(join(canonicalDir, 'hooks.yaml'), 'utf8')).not.toBe('');
    expect(await readFile(join(canonicalDir, 'permissions.yaml'), 'utf8')).not.toBe('');
    expect(await readFile(join(canonicalDir, 'ignore'), 'utf8')).not.toBe('');
  });

  it('never overwrites canonical files the user already authored', async () => {
    await mkdir(join(canonicalDir, 'rules'), { recursive: true });
    const mine = {
      'rules/_root.md': '---\nroot: true\n---\nMy own root rule\n',
      'mcp.json': '{"mcpServers":{"mine":{"command":"node"}}}\n',
      'hooks.yaml': 'PreToolUse:\n  - matcher: Edit\n    command: ./mine.sh\n',
      'permissions.yaml': 'allow:\n  - Read(*)\n',
      ignore: 'secrets/\n',
    };
    for (const [rel, content] of Object.entries(mine)) {
      await writeFile(join(canonicalDir, rel), content);
    }

    await writeScaffoldFull(canonicalDir);

    for (const [rel, content] of Object.entries(mine)) {
      expect(await readFile(join(canonicalDir, rel), 'utf8')).toBe(content);
    }
  });

  it('fills only the gaps when some canonical files exist', async () => {
    await writeFile(join(canonicalDir, 'ignore'), 'secrets/\n');

    await writeScaffoldFull(canonicalDir);

    expect(await readFile(join(canonicalDir, 'ignore'), 'utf8')).toBe('secrets/\n');
    expect(await readFile(join(canonicalDir, 'mcp.json'), 'utf8')).not.toBe('');
  });
});
