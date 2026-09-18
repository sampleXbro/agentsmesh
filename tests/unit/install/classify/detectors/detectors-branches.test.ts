/**
 * Branch coverage for the layout-detect helper modules under
 * `src/install/classify/detectors/`. Each test exercises a single
 * documented branch — file missing, wrong type, boilerplate filtered,
 * non-kebab skill directory, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dirExists,
  listDirEntries,
  classifyFileShape,
} from '../../../../../src/install/classify/detectors/fs-helpers.js';
import {
  detectCanonical,
  detectRootRule,
  detectRootSkill,
} from '../../../../../src/install/classify/detectors/root-shape.js';
import {
  detectFlatCollections,
  detectSkillPack,
  detectToolNativeManifests,
} from '../../../../../src/install/classify/detectors/collections.js';

let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-detectors-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('fs-helpers', () => {
  it('dirExists returns false for missing dir', async () => {
    expect(await dirExists(join(root, 'no-such-dir'))).toBe(false);
  });

  it('dirExists returns false when the path is a file, not a dir', async () => {
    writeFileSync(join(root, 'file.txt'), 'x');
    expect(await dirExists(join(root, 'file.txt'))).toBe(false);
  });

  it('dirExists returns true for an existing dir', async () => {
    mkdirSync(join(root, 'real'), { recursive: true });
    expect(await dirExists(join(root, 'real'))).toBe(true);
  });

  it('listDirEntries returns [] for missing dir', async () => {
    expect(await listDirEntries(join(root, 'gone'))).toEqual([]);
  });

  it('listDirEntries reports isFile / isDir correctly', async () => {
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'file.md'), 'x');
    const entries = await listDirEntries(root);
    const byName = new Map(entries.map((e) => [e.name, e]));
    expect(byName.get('sub')?.isDir).toBe(true);
    expect(byName.get('sub')?.isFile).toBe(false);
    expect(byName.get('file.md')?.isFile).toBe(true);
    expect(byName.get('file.md')?.isDir).toBe(false);
  });

  it('classifyFileShape returns the right shape for each extension', () => {
    expect(classifyFileShape('rule.instructions.md')).toBe('copilot-instructions');
    expect(classifyFileShape('rule.md')).toBe('md');
    expect(classifyFileShape('rule.mdc')).toBe('mdc');
    expect(classifyFileShape('config.toml')).toBe('toml');
    expect(classifyFileShape('thing.json')).toBeNull();
    expect(classifyFileShape('noext')).toBeNull();
  });
});

describe('root-shape detectors', () => {
  it('detectCanonical returns null when .agentsmesh dir is absent', async () => {
    expect(await detectCanonical(root)).toBeNull();
  });

  it('detectCanonical returns null when .agentsmesh exists but has no canonical marker', async () => {
    mkdirSync(join(root, '.agentsmesh', 'unrelated'), { recursive: true });
    writeFileSync(join(root, '.agentsmesh', 'unrelated', 'x.md'), '');
    expect(await detectCanonical(root)).toBeNull();
  });

  it('detectCanonical returns the path when .agentsmesh/rules/ exists', async () => {
    mkdirSync(join(root, '.agentsmesh', 'rules'), { recursive: true });
    expect(await detectCanonical(root)).toEqual({ path: '.agentsmesh' });
  });

  it('detectRootRule prefers .cursorrules over .windsurfrules when both exist', async () => {
    writeFileSync(join(root, '.cursorrules'), 'cursor');
    writeFileSync(join(root, '.windsurfrules'), 'windsurf');
    expect(await detectRootRule(root)).toEqual({ path: '.cursorrules' });
  });

  it('detectRootRule falls through to .windsurfrules when .cursorrules is absent', async () => {
    writeFileSync(join(root, '.windsurfrules'), 'windsurf');
    expect(await detectRootRule(root)).toEqual({ path: '.windsurfrules' });
  });

  it('detectRootRule returns null when neither legacy rule file exists', async () => {
    expect(await detectRootRule(root)).toBeNull();
  });

  it('detectRootRule does not match a directory named .cursorrules', async () => {
    mkdirSync(join(root, '.cursorrules'), { recursive: true });
    expect(await detectRootRule(root)).toBeNull();
  });

  it('detectRootSkill returns null when no root SKILL.md exists', async () => {
    expect(await detectRootSkill(root)).toBeNull();
  });

  it('detectRootSkill returns the path when SKILL.md is a regular file', async () => {
    writeFileSync(join(root, 'SKILL.md'), '# root skill');
    expect(await detectRootSkill(root)).toEqual({ path: 'SKILL.md' });
  });

  it('detectRootSkill returns null when SKILL.md is a directory', async () => {
    mkdirSync(join(root, 'SKILL.md'), { recursive: true });
    expect(await detectRootSkill(root)).toBeNull();
  });
});

describe('collections detectors', () => {
  it('detectSkillPack returns null when skills/ is missing', async () => {
    expect(await detectSkillPack(root)).toBeNull();
  });

  it('detectSkillPack skips an entry whose SKILL.md is a directory, not a file', async () => {
    // stat() succeeds but isFile() is false — the entry must not claim the pack.
    mkdirSync(join(root, 'skills', 'not-a-skill', 'SKILL.md'), { recursive: true });
    expect(await detectSkillPack(root)).toBeNull();
  });

  it('detectSkillPack returns null when skills/ has only underscore-prefixed dirs', async () => {
    mkdirSync(join(root, 'skills', '_template'), { recursive: true });
    writeFileSync(join(root, 'skills', '_template', 'SKILL.md'), '');
    expect(await detectSkillPack(root)).toBeNull();
  });

  it('detectSkillPack returns null when skills/ subdir is not kebab-case', async () => {
    mkdirSync(join(root, 'skills', 'NotKebab'), { recursive: true });
    writeFileSync(join(root, 'skills', 'NotKebab', 'SKILL.md'), '');
    expect(await detectSkillPack(root)).toBeNull();
  });

  it('detectSkillPack returns null when kebab dir has no SKILL.md', async () => {
    mkdirSync(join(root, 'skills', 'demo'), { recursive: true });
    expect(await detectSkillPack(root)).toBeNull();
  });

  it('detectSkillPack returns the path when at least one kebab dir has SKILL.md', async () => {
    mkdirSync(join(root, 'skills', 'demo'), { recursive: true });
    writeFileSync(join(root, 'skills', 'demo', 'SKILL.md'), '# demo');
    expect(await detectSkillPack(root)).toEqual({ path: 'skills' });
  });

  it('detectFlatCollections returns empty when none of the conventional dirs exist', async () => {
    expect(await detectFlatCollections(root)).toEqual([]);
  });

  it('detectFlatCollections skips boilerplate files in a rules/ directory', async () => {
    mkdirSync(join(root, 'rules'), { recursive: true });
    writeFileSync(join(root, 'rules', 'README.md'), '# readme');
    writeFileSync(join(root, 'rules', 'LICENSE'), 'mit');
    expect(await detectFlatCollections(root)).toEqual([]);
  });

  it('detectFlatCollections records the shape per discovered file', async () => {
    mkdirSync(join(root, 'rules'), { recursive: true });
    writeFileSync(join(root, 'rules', 'a.md'), '');
    writeFileSync(join(root, 'rules', 'b.mdc'), '');
    const result = await detectFlatCollections(root);
    const shapes = result.map((c) => c.fileShape).sort();
    expect(shapes).toEqual(['md', 'mdc']);
    for (const c of result) {
      expect(c.path).toBe('rules');
      expect(c.suggestedAs).toBe('rules');
    }
  });

  it('detectFlatCollections ignores nested directories (only top-level files in the dir)', async () => {
    mkdirSync(join(root, 'rules', 'nested'), { recursive: true });
    writeFileSync(join(root, 'rules', 'nested', 'deep.md'), '');
    expect(await detectFlatCollections(root)).toEqual([]);
  });

  it('detectFlatCollections classifies all 4 conventional dirs distinctly', async () => {
    for (const dir of ['rules', 'commands', 'agents', 'skills']) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'one.md'), '');
    }
    const result = await detectFlatCollections(root);
    const suggested = result.map((c) => c.suggestedAs).sort();
    expect(suggested).toEqual(['agents', 'commands', 'rules', 'skills']);
  });

  it('detectToolNativeManifests returns [] when no plugin dirs exist', async () => {
    expect(await detectToolNativeManifests(root)).toEqual([]);
  });

  it('detectToolNativeManifests reports every present plugin marker', async () => {
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    mkdirSync(join(root, '.cursor-plugin'), { recursive: true });
    const result = await detectToolNativeManifests(root);
    expect(result.map((m) => m.path).sort()).toEqual(['.claude-plugin', '.cursor-plugin']);
  });
});
