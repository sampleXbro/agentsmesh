/**
 * Branch coverage tests for src/cli/commands/init-scaffold.ts.
 *
 * Both writeScaffoldFull (always-creates) and writeScaffoldGapFill (creates
 * only where the import left a category empty) are exercised here. The goal
 * is to hit each conditional in writeScaffoldGapFill: rulesMd === 0,
 * !hasRoot fallback, the per-file existence checks for mcp/hooks/permissions/
 * ignore, and hasAnyImportedSkill skip-prefix + missing-SKILL.md branches.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeScaffoldFull,
  writeScaffoldGapFill,
} from '../../../../src/cli/commands/init-scaffold.js';

const TEST_DIR = join(tmpdir(), 'am-init-scaffold-branches-test');

function canonical(): string {
  return join(TEST_DIR, '.agentsmesh');
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('writeScaffoldFull', () => {
  it('creates the full canonical scaffold tree', async () => {
    await writeScaffoldFull(canonical(), 'project');

    expect(existsSync(join(canonical(), 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'rules', '_example.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'commands', '_example.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'agents', '_example.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'skills', '_example', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'mcp.json'))).toBe(true);
    expect(existsSync(join(canonical(), 'hooks.yaml'))).toBe(true);
    expect(existsSync(join(canonical(), 'permissions.yaml'))).toBe(true);
    expect(existsSync(join(canonical(), 'ignore'))).toBe(true);
  });
});

describe('writeScaffoldGapFill — rules branch', () => {
  it('creates _root.md and _example.md when rules dir has 0 .md files', async () => {
    mkdirSync(canonical(), { recursive: true });
    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(canonical(), 'rules', '_example.md'))).toBe(true);
  });

  it('creates only _root.md when rules dir has a non-root .md but no _root.md', async () => {
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', 'typescript.md'), '# TS rules\n');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'rules', '_root.md'))).toBe(true);
    // _example.md should NOT be created because rules dir already had a non-root .md
    expect(existsSync(join(canonical(), 'rules', '_example.md'))).toBe(false);
    // pre-existing typescript.md left untouched
    expect(readFileSync(join(canonical(), 'rules', 'typescript.md'), 'utf-8')).toContain(
      '# TS rules',
    );
  });

  it('does not overwrite existing _root.md when rules dir already has it', async () => {
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# Imported root\n');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(readFileSync(join(canonical(), 'rules', '_root.md'), 'utf-8')).toBe('# Imported root\n');
  });
});

describe('writeScaffoldGapFill — commands / agents branch', () => {
  it('skips _example.md when commands dir already has any .md', async () => {
    mkdirSync(join(canonical(), 'commands'), { recursive: true });
    writeFileSync(join(canonical(), 'commands', 'review.md'), 'review body');
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'commands', '_example.md'))).toBe(false);
  });

  it('creates _example.md in agents when agents dir is empty', async () => {
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'agents', '_example.md'))).toBe(true);
  });
});

describe('writeScaffoldGapFill — skills branch', () => {
  it('creates _example skill when no real skill folders exist (only underscore-prefixed)', async () => {
    mkdirSync(join(canonical(), 'skills', '_helper'), { recursive: true });
    writeFileSync(join(canonical(), 'skills', '_helper', 'SKILL.md'), '# helper');
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'skills', '_example', 'SKILL.md'))).toBe(true);
  });

  it('skips _example skill when real skill (with SKILL.md) exists', async () => {
    mkdirSync(join(canonical(), 'skills', 'review'), { recursive: true });
    writeFileSync(join(canonical(), 'skills', 'review', 'SKILL.md'), '# review');
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'skills', '_example'))).toBe(false);
  });

  it('creates _example skill when skill folder exists but lacks SKILL.md', async () => {
    // Folder exists, but SKILL.md is missing → hasAnyImportedSkill returns false
    mkdirSync(join(canonical(), 'skills', 'review'), { recursive: true });
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'skills', '_example', 'SKILL.md'))).toBe(true);
  });

  it('creates _example skill when skills root dir does not yet exist', async () => {
    mkdirSync(join(canonical(), 'rules'), { recursive: true });
    writeFileSync(join(canonical(), 'rules', '_root.md'), '# r');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(existsSync(join(canonical(), 'skills', '_example', 'SKILL.md'))).toBe(true);
  });
});

describe('writeScaffoldGapFill — settings file branches', () => {
  it('skips mcp.json/hooks.yaml/permissions.yaml/ignore when each pre-exists', async () => {
    mkdirSync(canonical(), { recursive: true });
    writeFileSync(join(canonical(), 'mcp.json'), '{"existing":true}');
    writeFileSync(join(canonical(), 'hooks.yaml'), 'existing-hooks: yes');
    writeFileSync(join(canonical(), 'permissions.yaml'), 'allow: []');
    writeFileSync(join(canonical(), 'ignore'), 'pre-existing\n');

    await writeScaffoldGapFill(canonical(), 'project');

    expect(readFileSync(join(canonical(), 'mcp.json'), 'utf-8')).toBe('{"existing":true}');
    expect(readFileSync(join(canonical(), 'hooks.yaml'), 'utf-8')).toBe('existing-hooks: yes');
    expect(readFileSync(join(canonical(), 'permissions.yaml'), 'utf-8')).toBe('allow: []');
    expect(readFileSync(join(canonical(), 'ignore'), 'utf-8')).toBe('pre-existing\n');
  });
});
