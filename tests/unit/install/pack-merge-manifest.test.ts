import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { materializePack } from '../../../src/install/pack/pack-writer.js';
import { mergeIntoPack } from '../../../src/install/pack/pack-merge.js';
import { detectModifiedFiles } from '../../../src/install/uninstall/detect-modified.js';
import { hashPackFiles } from '../../../src/install/manifest/install-manifest-hash.js';
import type { PackMetadata } from '../../../src/install/pack/pack-schema.js';
import type { CanonicalFiles, CanonicalRule } from '../../../src/core/types.js';

const MANIFEST = '.agentsmesh-install-manifest.json';

let tmp = '';
let srcDir = '';
let packsDir = '';
let packDir = '';

function srcFile(rel: string, content: string): string {
  const path = join(srcDir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function ruleOf(name: string, body = `# ${name}\n`): CanonicalRule {
  const source = srcFile(`rules/${name}.md`, `---\ndescription: ${name}\n---\n${body}`);
  return { source, root: false, targets: [], description: name, globs: [], body };
}

function canonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
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

function readManifest(): { files: Record<string, string> } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(packDir, MANIFEST), 'utf8')) as {
    files: Record<string, string>;
  };
}

async function installPack(initial: CanonicalFiles): Promise<PackMetadata> {
  return materializePack(
    packsDir,
    'p',
    initial,
    {
      name: 'p',
      source: 'github:org/repo@abc',
      source_kind: 'github',
      installed_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      features: ['rules', 'commands', 'mcp'],
    },
    { source_type: 'canonical-agentsmesh' },
  );
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pack-merge-manifest-'));
  srcDir = join(tmp, 'src');
  packsDir = join(tmp, 'packs');
  packDir = join(packsDir, 'p');
  mkdirSync(packsDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('mergeIntoPack — install manifest', () => {
  it('records new hashes for the files it writes and keeps edits made before it', async () => {
    const command = srcFile('commands/c.md', '---\ndescription: c\n---\n# c\n');
    const meta = await installPack(
      canonical({
        rules: [ruleOf('a')],
        commands: [{ source: command, name: 'c', description: 'c', allowedTools: [], body: '' }],
        mcp: { mcpServers: { one: { type: 'stdio', command: 'one', args: [], env: {} } } },
      }),
    );
    const before = readManifest();
    writeFileSync(join(packDir, 'rules', 'a.md'), '# my edit\n');
    rmSync(join(packDir, 'commands', 'c.md'));
    writeFileSync(join(packDir, 'notes.md'), '# notes\n');
    const skill = srcFile('skills/s/SKILL.md', '---\ndescription: s\n---\n# s\n');
    const support = srcFile('skills/s/ref/guide.md', '# guide\n');
    const readme = srcFile('README.md', '# readme\n');

    await mergeIntoPack(
      packDir,
      meta,
      canonical({
        rules: [ruleOf('b')],
        skills: [
          {
            source: skill,
            name: 's',
            description: 's',
            body: '',
            supportingFiles: [{ relativePath: 'ref/guide.md', absolutePath: support, content: '' }],
          },
        ],
        mcp: { mcpServers: { two: { type: 'stdio', command: 'two', args: [], env: {} } } },
        permissions: { allow: ['Read'] },
        hooks: { PreToolUse: [{ matcher: 'Bash', command: 'echo hi' }] },
        ignore: ['secret'],
      }),
      ['rules', 'skills', 'mcp', 'permissions', 'hooks', 'ignore'],
      undefined,
      undefined,
      [{ relativePath: 'README.md', absolutePath: readme }],
    );

    const after = readManifest();
    const current = await hashPackFiles(packDir);
    const written = [
      'README.md',
      'hooks.yaml',
      'ignore',
      'mcp.json',
      'permissions.yaml',
      'rules/b.md',
      'skills/s/SKILL.md',
      'skills/s/ref/guide.md',
    ];
    expect(after).toEqual({
      ...before,
      files: {
        ...before.files,
        ...Object.fromEntries(written.map((rel) => [rel, current[rel]])),
      },
    });
    expect(Object.keys(after.files)).toEqual([
      'commands/c.md',
      'hooks.yaml',
      'ignore',
      'mcp.json',
      'permissions.yaml',
      'README.md',
      'rules/a.md',
      'rules/b.md',
      'skills/s/ref/guide.md',
      'skills/s/SKILL.md',
    ]);
    expect(await detectModifiedFiles(packDir, after.files)).toEqual([
      { relativePath: 'commands/c.md', status: 'deleted' },
      { relativePath: 'notes.md', status: 'added' },
      { relativePath: 'rules/a.md', status: 'modified' },
    ]);
  });

  it('takes the new bytes of an edited file that the merge writes again', async () => {
    const meta = await installPack(canonical({ rules: [ruleOf('a')] }));
    writeFileSync(join(packDir, 'rules', 'a.md'), '# my edit\n');

    await mergeIntoPack(
      packDir,
      meta,
      canonical({ rules: [ruleOf('a', '# v2\n')] }),
      ['rules'],
      undefined,
    );

    const after = readManifest();
    expect(after.files).toEqual(await hashPackFiles(packDir));
    expect(await detectModifiedFiles(packDir, after.files)).toEqual([]);
  });

  it('does not create a manifest for a legacy pack without one', async () => {
    const meta = await installPack(canonical({ rules: [ruleOf('a')] }));
    rmSync(join(packDir, MANIFEST));

    await mergeIntoPack(packDir, meta, canonical({ rules: [ruleOf('b')] }), ['rules'], undefined);

    expect(existsSync(join(packDir, MANIFEST))).toBe(false);
  });
});
