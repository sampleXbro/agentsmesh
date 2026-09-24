/**
 * What a local, non-canonical source installs.
 *
 * - A skill folder that is not kebab-case (`skills/my_skill/`) next to
 *   `rules/` used to make the source look like a lone rules collection: the
 *   skills, README and LICENSE were dropped without a word.
 * - Settings files at the root of such a source (mcp.json, hooks.yaml,
 *   permissions.yaml, ignore) are only installed from a source's own
 *   `.agentsmesh/` folder; elsewhere they are ignored, and install says so.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readInstallManifest } from '../../src/install/core/install-manifest.js';
import { runInstall } from '../../src/install/run/run-install.js';
import { logger } from '../../src/utils/output/logger.js';

let root: string;
let project: string;
let source: string;

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-local-layout-'));
  project = join(root, 'project');
  source = join(root, 'src-pack');
  write(join(source, 'rules', 'r1.md'), '---\ndescription: R one.\n---\nRule one.\n');
  write(join(source, 'README.md'), '# Pack\n');
  write(join(source, 'LICENSE'), 'MIT\n');
  write(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills, mcp, hooks, permissions, ignore]\nextends: []\n',
  );
  write(join(project, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const packDir = (): string => join(project, '.agentsmesh', 'packs', 'mypack');

describe('local non-canonical source', () => {
  it('installs a non-kebab skill folder with the rules, README and LICENSE', async () => {
    write(
      join(source, 'skills', 'my_skill', 'SKILL.md'),
      '---\nname: my_skill\ndescription: My skill.\n---\nBody.\n',
    );

    await runInstall({ force: true, name: 'mypack' }, [source], project);

    expect(readdirSync(packDir()).sort()).toEqual([
      '.agentsmesh-install-manifest.json',
      'LICENSE',
      'README.md',
      'pack.yaml',
      'rules',
      'skills',
    ]);
    expect(existsSync(join(packDir(), 'skills', 'my_skill', 'SKILL.md'))).toBe(true);
    const [entry] = await readInstallManifest(join(project, '.agentsmesh'));
    expect([...(entry?.features ?? [])].sort()).toEqual(['rules', 'skills']);
    expect(entry?.path).toBeUndefined();
    expect(entry?.as).toBeUndefined();
  });

  it('warns that root settings files are ignored, naming each one', async () => {
    write(join(source, 'mcp.json'), '{"mcpServers":{}}\n');
    write(join(source, 'hooks.yaml'), 'PreToolUse: []\n');
    write(join(source, 'permissions.yaml'), 'allow: []\n');
    write(join(source, 'ignore'), 'dist\n');
    const warn = vi.spyOn(logger, 'warn');

    await runInstall({ force: true, name: 'mypack' }, [source], project);

    const notices = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('.agentsmesh/'));
    expect(notices).toHaveLength(1);
    for (const file of ['mcp.json', 'hooks.yaml', 'permissions.yaml', 'ignore']) {
      expect(notices[0]).toContain(file);
    }
    expect(existsSync(join(packDir(), 'mcp.json'))).toBe(false);
  });

  it('gives no settings notice when the source root has none', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await runInstall({ force: true, name: 'mypack' }, [source], project);
    expect(
      warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('.agentsmesh/')),
    ).toEqual([]);
  });
});
