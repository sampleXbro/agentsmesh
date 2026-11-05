import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { materializePack } from '../../../src/install/pack/pack-writer.js';
import { loadPacksCanonical } from '../../../src/canonical/load/pack-load.js';
import { mergeIntoPack } from '../../../src/install/pack/pack-merge.js';
import type { CanonicalFiles } from '../../../src/core/types.js';
import type { StdioMcpServer } from '../../../src/core/mcp-types.js';
import type { PackMetadata } from '../../../src/install/pack/pack-schema.js';

let rootDir: string;
let srcDir: string;
let packsDir: string;

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

const BASE_META: Omit<PackMetadata, 'content_hash'> = {
  name: 'settings-pack',
  source: 'github:org/repo@abc123',
  version: 'abc123',
  source_kind: 'github',
  installed_at: '2026-03-22T10:00:00Z',
  updated_at: '2026-03-22T10:00:00Z',
  features: ['skills', 'mcp', 'permissions', 'hooks', 'ignore'],
};

beforeEach(() => {
  rootDir = join(tmpdir(), `pack-settings-test-${Date.now()}`);
  srcDir = join(rootDir, 'src');
  packsDir = join(rootDir, 'packs');
  mkdirSync(join(srcDir, 'skills', 'demo'), { recursive: true });
  writeFileSync(
    join(srcDir, 'skills', 'demo', 'SKILL.md'),
    '---\ndescription: Demo\n---\n# Demo\n',
  );
  mkdirSync(packsDir, { recursive: true });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('pack settings persistence', () => {
  it('materializePack writes canonical mcp/permissions/hooks/ignore files', async () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: join(srcDir, 'skills', 'demo', 'SKILL.md'),
          name: 'demo',
          description: 'Demo',
          body: '# Demo\n',
          supportingFiles: [],
        },
      ],
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
        },
      },
      permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
      hooks: {
        PostToolUse: [{ matcher: '*.ts', command: 'prettier --write $FILE_PATH' }],
      },
      ignore: ['node_modules', 'dist'],
    });

    await materializePack(packsDir, 'settings-pack', canonical, BASE_META);

    const packDir = join(packsDir, 'settings-pack');
    expect(existsSync(join(packDir, 'mcp.json'))).toBe(true);
    expect(existsSync(join(packDir, 'permissions.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'hooks.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'ignore'))).toBe(true);
    expect(readFileSync(join(packDir, 'ignore'), 'utf-8')).toContain('node_modules');
  });

  it('loadPacksCanonical restores canonical settings from a materialized pack', async () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
        },
      },
      permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
      hooks: {
        PostToolUse: [{ matcher: '*.ts', command: 'prettier --write $FILE_PATH' }],
      },
      ignore: ['node_modules', 'dist'],
    });

    await materializePack(packsDir, 'settings-pack', canonical, {
      ...BASE_META,
      features: ['mcp', 'permissions', 'hooks', 'ignore'],
    });

    const loaded = await loadPacksCanonical(rootDir);

    expect((loaded.mcp?.mcpServers.context7 as StdioMcpServer | undefined)?.command).toBe('npx');
    expect(loaded.permissions).toEqual({ allow: ['Read'], deny: ['Bash(rm:*)'] });
    expect(loaded.hooks?.PostToolUse?.[0]?.command).toBe('prettier --write $FILE_PATH');
    expect(loaded.ignore).toEqual(['node_modules', 'dist']);
  });

  it('mergeIntoPack writes new canonical settings into an existing pack', async () => {
    const baseMeta = await materializePack(packsDir, 'settings-pack', makeCanonical(), {
      ...BASE_META,
      features: ['skills'],
    });

    const updatedMeta = await mergeIntoPack(
      join(packsDir, 'settings-pack'),
      baseMeta,
      makeCanonical({
        mcp: {
          mcpServers: {
            context7: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@upstash/context7-mcp'],
              env: {},
            },
          },
        },
        permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
        hooks: {
          PostToolUse: [{ matcher: '*.ts', command: 'prettier --write $FILE_PATH' }],
        },
        ignore: ['node_modules'],
      }),
      ['mcp', 'permissions', 'hooks', 'ignore'],
      undefined,
    );

    const packDir = join(packsDir, 'settings-pack');
    expect(existsSync(join(packDir, 'mcp.json'))).toBe(true);
    expect(existsSync(join(packDir, 'permissions.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'hooks.yaml'))).toBe(true);
    expect(existsSync(join(packDir, 'ignore'))).toBe(true);
    expect(updatedMeta.features).toEqual(['skills', 'mcp', 'permissions', 'hooks', 'ignore']);
  });
});
