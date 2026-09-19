import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveScopeContext } from '../../../../src/config/core/scope.js';
import { applyInitPlan, type InitPlan } from '../../../../src/cli/commands/init-apply.js';

const TEST_DIR = join(tmpdir(), 'am-init-apply-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function projectPlan(over: Partial<InitPlan> = {}): InitPlan {
  return {
    scope: 'project',
    targets: ['claude-code', 'cursor'],
    detected: [],
    doImport: false,
    lessons: false,
    ...over,
  };
}

describe('applyInitPlan (project, no import)', () => {
  it('writes config with exactly the planned targets and full scaffold', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const data = await applyInitPlan(TEST_DIR, context, projectPlan());

    const config = readFileSync(join(TEST_DIR, 'agentsmesh.yaml'), 'utf-8');
    expect(config).toContain('- claude-code');
    expect(config).toContain('- cursor');
    expect(config).not.toContain('- gemini-cli');

    expect(data.scaffoldType).toBe('full');
    expect(data.gitignoreUpdated).toBe(true);
    expect(data.detectedConfigs).toEqual([]);
    expect(data.lessons).toBeUndefined();
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'agentsmesh.local.yaml'))).toBe(true);
  });

  it('scaffolds lessons when plan.lessons is true', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const data = await applyInitPlan(TEST_DIR, context, projectPlan({ lessons: true }));
    expect(data.lessons).toBeDefined();
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(true);
  });

  it('skips a detected tool that has no importer (unknown id) but still counts it', async () => {
    const context = resolveScopeContext(TEST_DIR, 'project');
    const plan = projectPlan({ doImport: true, detected: ['nonexistent-tool'] });
    const data = await applyInitPlan(TEST_DIR, context, plan);

    // No importer exists for the unknown id, so the import loop hits `continue`
    // and nothing is moved, but toolIds.length still counts the detected entry.
    expect(data.imported).toEqual([]);
    expect(data.importedToolCount).toBe(1);
    expect(data.scaffoldType).toBe('gap-fill');
  });
});

describe('applyInitPlan (global scope — lessons never available)', () => {
  it('does NOT scaffold lessons in global scope even when plan.lessons is true', async () => {
    const home = join(TEST_DIR, 'home');
    const workspace = join(TEST_DIR, 'workspace');
    mkdirSync(workspace, { recursive: true });
    const globalDir = join(home, '.agentsmesh');
    const context = {
      scope: 'global' as const,
      rootBase: home,
      configDir: globalDir,
      canonicalDir: globalDir,
    };
    const plan: InitPlan = {
      scope: 'global',
      targets: ['claude-code'],
      detected: [],
      doImport: false,
      lessons: true,
    };

    const data = await applyInitPlan(workspace, context, plan);

    // Lessons is project-only — global must never scaffold it, regardless of plan.lessons.
    expect(data.lessons).toBeUndefined();
    expect(existsSync(join(workspace, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(false);
    expect(existsSync(join(globalDir, 'lessons', 'lessons.json'))).toBe(false);
  });
});
