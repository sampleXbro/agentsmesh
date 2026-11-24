import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../../../../src/core/generate/engine.js';
import { loadCanonicalWithExtends } from '../../../../src/canonical/extends/extends.js';
import { configSchema } from '../../../../src/config/core/schema.js';
import { buildOutputChecksums } from '../../../../src/config/core/lock-outputs.js';
import { hashFileForManifest } from '../../../../src/utils/crypto/hash.js';
import { writeFileAtomic } from '../../../../src/utils/filesystem/fs.js';

const ROOT = join(tmpdir(), `agentsmesh-files-gen-${process.pid}`);

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
});
afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

describe('files feature generate', () => {
  it('copies files byte-for-byte without rewriting markdown links', async () => {
    const project = join(ROOT, 'proj');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\nRoot\n',
    );
    mkdirSync(join(project, '.agentsmesh', 'files', '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'files', 'NOTES.md'),
      'See [.agentsmesh/rules/_root.md](.agentsmesh/rules/_root.md)\n',
    );
    writeFileSync(
      join(project, '.agentsmesh', 'files', '.github', 'workflows', 'ci.yml'),
      'name: ci\n',
    );
    writeFileSync(
      join(project, 'agentsmesh.yaml'),
      'version: 1\ntargets: [cursor]\nfeatures: [rules, files]\n',
    );

    const config = configSchema.parse({
      version: 1,
      targets: ['cursor'],
      features: ['rules', 'files'],
    });
    const { canonical } = await loadCanonicalWithExtends(config, project);
    const results = await generate({ config, canonical, projectRoot: project });
    const notes = results.find((r) => r.path === 'NOTES.md');
    expect(notes?.content).toBe('See [.agentsmesh/rules/_root.md](.agentsmesh/rules/_root.md)\n');
    expect(results.some((r) => r.path === '.github/workflows/ci.yml')).toBe(true);
  });

  it('skips emission when files is not enabled', async () => {
    const project = join(ROOT, 'disabled');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(project, '.agentsmesh', 'files'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\nRoot\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'files', 'mise.toml'), 'x = 1\n');
    const config = configSchema.parse({
      version: 1,
      targets: ['cursor'],
      features: ['rules'],
    });
    const { canonical } = await loadCanonicalWithExtends(config, project);
    const results = await generate({ config, canonical, projectRoot: project });
    expect(results.some((r) => r.path === 'mise.toml')).toBe(false);
  });

  it('skips emission in global scope with a warning path', async () => {
    const project = join(ROOT, 'global');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(project, '.agentsmesh', 'files'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\nRoot\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'files', 'mise.toml'), 'x = 1\n');
    const config = configSchema.parse({
      version: 1,
      targets: ['cursor'],
      features: ['rules', 'files'],
    });
    const { canonical } = await loadCanonicalWithExtends(config, project);
    const results = await generate({
      config,
      canonical,
      projectRoot: project,
      scope: 'global',
    });
    expect(results.some((r) => r.path === 'mise.toml')).toBe(false);
  });

  it('writes identical bytes to two project roots for an LF fixture', async () => {
    const fixture = 'node_modules\ndist\n';
    for (const name of ['a', 'b']) {
      const project = join(ROOT, name);
      mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
      mkdirSync(join(project, '.agentsmesh', 'files'), { recursive: true });
      writeFileSync(
        join(project, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\nRoot\n',
      );
      writeFileSync(join(project, '.agentsmesh', 'files', '.gitignore'), fixture);
      const config = configSchema.parse({
        version: 1,
        targets: ['cursor'],
        features: ['rules', 'files'],
      });
      const { canonical } = await loadCanonicalWithExtends(config, project);
      const results = await generate({ config, canonical, projectRoot: project });
      const entry = results.find((r) => r.path === '.gitignore');
      expect(entry).toBeDefined();
      await writeFileAtomic(join(project, '.gitignore'), entry!.content);
    }
    expect(readFileSync(join(ROOT, 'a', '.gitignore'))).toEqual(
      readFileSync(join(ROOT, 'b', '.gitignore')),
    );
  });

  it('locks an output hash that matches the written file', async () => {
    const project = join(ROOT, 'lock');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(project, '.agentsmesh', 'files'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\nRoot\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'files', 'mise.toml'), 'x = 1\n');
    const config = configSchema.parse({
      version: 1,
      targets: ['cursor'],
      features: ['rules', 'files'],
    });
    const { canonical } = await loadCanonicalWithExtends(config, project);
    const results = await generate({ config, canonical, projectRoot: project });
    const entry = results.find((r) => r.path === 'mise.toml')!;
    await writeFileAtomic(join(project, 'mise.toml'), entry.content);
    const checksums = buildOutputChecksums(results);
    const onDisk = await hashFileForManifest(join(project, 'mise.toml'));
    expect(checksums['mise.toml']).toBe(`sha256:${onDisk}`);
    expect(existsSync(join(project, 'mise.toml'))).toBe(true);
  });

  it('lets a local files tree replace an extended file', async () => {
    const shared = join(ROOT, 'shared');
    const project = join(ROOT, 'consumer');
    mkdirSync(join(shared, '.agentsmesh', 'files'), { recursive: true });
    writeFileSync(join(shared, '.agentsmesh', 'files', '.gitignore'), 'from-extend\n');
    mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(project, '.agentsmesh', 'files'), { recursive: true });
    writeFileSync(
      join(project, '.agentsmesh', 'rules', '_root.md'),
      '---\nroot: true\n---\nRoot\n',
    );
    writeFileSync(join(project, '.agentsmesh', 'files', '.gitignore'), 'from-local\n');
    const config = configSchema.parse({
      version: 1,
      targets: ['cursor'],
      features: ['rules', 'files'],
      extends: [
        {
          name: 'shared',
          source: shared,
          features: ['files'],
        },
      ],
    });
    const { canonical } = await loadCanonicalWithExtends(config, project);
    expect(canonical.files?.find((f) => f.path === '.gitignore')?.content).toBe('from-local\n');
  });
});
