/**
 * A pack or extend that ships ignore patterns must not replace the ignore files
 * a user wrote by hand while their own ignore file holds no patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../../src/cli/commands/init.js';
import { TEMPLATE_IGNORE } from '../../src/cli/commands/init-templates.js';
import { runInstall } from '../../src/install/run/run-install.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { logger } from '../../src/utils/output/logger.js';

const ROOT = join(tmpdir(), 'am-install-ignore-unmanaged-integration');
const HOME = join(ROOT, 'home');
const WORKSPACE = join(ROOT, 'workspace');
const PROJECT = join(ROOT, 'project');
const PACK = join(ROOT, 'pack');

const SKIPPED_WARNING =
  '[agentsmesh] Skipped ignore patterns from installed packs or extends: dist/. ' +
  'Your own ignore file (.agentsmesh/ignore, or ~/.agentsmesh/ignore with --global) has no patterns, ' +
  'so AgentsMesh leaves the ignore files in your tools alone. ' +
  'To use these patterns, run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh) ' +
  'to copy in the patterns your tools already have, ' +
  'or add the patterns you want to your own ignore file, then generate again.';

let warn: MockInstance<typeof logger.warn>;

function skippedWarnings(): unknown[][] {
  return warn.mock.calls.filter(([msg]) => String(msg).includes('Skipped ignore patterns'));
}

function writePack(dir: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'demo.md'),
    '---\ndescription: Demo rule\n---\n# Demo\n',
  );
  writeFileSync(join(dir, '.agentsmesh', 'ignore'), 'dist/\n');
}

function writeProject(extendsYaml = 'extends: []\n'): void {
  mkdirSync(join(PROJECT, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(PROJECT, 'agentsmesh.yaml'),
    `version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules, ignore]\n${extendsYaml}`,
  );
  writeFileSync(join(PROJECT, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# R\n');
  writeFileSync(join(PROJECT, '.cursorignore'), 'secret/\n');
  writeFileSync(join(PROJECT, '.claudeignore'), 'private/\n');
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('ignore patterns from packs and extends while canonical ignore is unmanaged', () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(WORKSPACE, { recursive: true });
    writePack(PACK);
    vi.stubEnv('HOME', HOME);
    vi.stubEnv('USERPROFILE', HOME);
    warn = vi.spyOn(logger, 'warn');
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    rmSync(ROOT, { recursive: true, force: true });
  });

  it('project install keeps hand-written ignore files when the ignore file has only comments', async () => {
    writeProject();
    writeFileSync(join(PROJECT, '.agentsmesh', 'ignore'), TEMPLATE_IGNORE);

    await runInstall({ force: true, name: 'ignore-pack' }, [PACK], PROJECT);

    expect(read(join(PROJECT, '.cursorignore'))).toBe('secret/\n');
    expect(read(join(PROJECT, '.claudeignore'))).toBe('private/\n');
    expect(read(join(PROJECT, '.agentsmesh', 'packs', 'ignore-pack', 'ignore'))).toBe('dist/\n');
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('project install keeps hand-written ignore files when there is no ignore file', async () => {
    writeProject();

    await runInstall({ force: true, name: 'ignore-pack' }, [PACK], PROJECT);

    expect(read(join(PROJECT, '.cursorignore'))).toBe('secret/\n');
    expect(read(join(PROJECT, '.claudeignore'))).toBe('private/\n');
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('a local extend keeps hand-written ignore files (project)', async () => {
    writeProject(
      `extends:\n  - name: base\n    source: ${JSON.stringify(PACK)}\n    features: [ignore]\n`,
    );

    await runGenerate({}, PROJECT, { printMatrix: false });

    expect(read(join(PROJECT, '.cursorignore'))).toBe('secret/\n');
    expect(read(join(PROJECT, '.claudeignore'))).toBe('private/\n');
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('install --global keeps hand-written ignore files in the home folder', async () => {
    await runInit(WORKSPACE, { global: true, yes: true, targets: ['claude-code', 'cursor'] });
    writeFileSync(join(HOME, '.cursorignore'), 'secret/\n');
    writeFileSync(join(HOME, '.claudeignore'), 'private/\n');

    await runInstall({ global: true, force: true, name: 'ignore-pack' }, [PACK], WORKSPACE);

    expect(read(join(HOME, '.cursorignore'))).toBe('secret/\n');
    expect(read(join(HOME, '.claudeignore'))).toBe('private/\n');
    expect(read(join(HOME, '.agentsmesh', 'packs', 'ignore-pack', 'ignore'))).toBe('dist/\n');
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('adding own patterns opts in: the pack patterns join them', async () => {
    writeProject();
    await runInstall({ force: true, name: 'ignore-pack' }, [PACK], PROJECT);

    writeFileSync(join(PROJECT, '.agentsmesh', 'ignore'), 'secret/\nprivate/\n');
    warn.mockClear();
    await runGenerate({}, PROJECT, { printMatrix: false });

    expect(read(join(PROJECT, '.cursorignore'))).toBe('dist/\nsecret/\nprivate/');
    expect(read(join(PROJECT, '.claudeignore'))).toBe('dist/\nsecret/\nprivate/');
    expect(skippedWarnings()).toEqual([]);
  });

  it('removes the ignore files AgentsMesh wrote once the ignore file has no patterns', async () => {
    writeProject();
    writeFileSync(join(PROJECT, '.agentsmesh', 'ignore'), 'build/\n');
    await runInstall({ force: true, name: 'ignore-pack' }, [PACK], PROJECT);

    writeFileSync(join(PROJECT, '.agentsmesh', 'ignore'), TEMPLATE_IGNORE);
    await runGenerate({}, PROJECT, { printMatrix: false });

    expect(existsSync(join(PROJECT, '.cursorignore'))).toBe(false);
    expect(existsSync(join(PROJECT, '.claudeignore'))).toBe(false);
    expect(skippedWarnings()).toEqual([[SKIPPED_WARNING]]);
  });

  it('project install still adds pack patterns to a managed ignore file', async () => {
    writeProject();
    writeFileSync(join(PROJECT, '.agentsmesh', 'ignore'), 'build/\n');

    await runInstall({ force: true, name: 'ignore-pack' }, [PACK], PROJECT);

    expect(read(join(PROJECT, '.cursorignore'))).toBe('dist/\nbuild/');
    expect(read(join(PROJECT, '.claudeignore'))).toBe('dist/\nbuild/');
    expect(skippedWarnings()).toEqual([]);
  });
});
