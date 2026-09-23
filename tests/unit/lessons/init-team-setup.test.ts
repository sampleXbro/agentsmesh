/**
 * `init --lessons` sets up the team path, not just the person who ran it.
 *
 * Before: the per-clone merge-driver config was only printed, so every other
 * clone merged lessons.json textually and two ordinary captures on separate
 * branches left conflict markers that switched recall off. And the recall hook
 * called a global `agentsmesh`, so a teammate with only a project dependency
 * got no recall at all, silently.
 *
 * The scaffold now reports the merge-driver setup it performed and, when hooks
 * still depend on a global install, a hint to make agentsmesh a dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldLessons } from '../../../src/lessons/init.js';
import { RECALL_HOOK_TEAM_HINT } from '../../../src/lessons/recall-hook-hint.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lessons-team-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
  writeFileSync(join(root, '.agentsmesh/hooks.yaml'), '# hooks\n', 'utf8');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scaffoldLessons team setup', () => {
  it('reports the merge driver as skipped outside a git repository', async () => {
    const result = await scaffoldLessons(root);
    expect(result.mergeDriver.status).toBe('skipped');
  });

  it('warns that teammates need a global install when agentsmesh is not a dependency', async () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { vitest: '4' } }));
    const result = await scaffoldLessons(root);
    expect(result.recallHookTeamHint).toBe(RECALL_HOOK_TEAM_HINT);
  });

  it('launches the project copy and gives no hint when agentsmesh is a dependency', async () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ devDependencies: { agentsmesh: '^0.41.0' } }),
    );
    const result = await scaffoldLessons(root);
    expect(result.recallHookTeamHint).toBeNull();
    expect(readFileSync(join(root, '.agentsmesh/hooks.yaml'), 'utf8')).toContain(
      'npx --no --offline agentsmesh lessons hook',
    );
  });

  it('gives no hint for a project that is not a Node project', async () => {
    const result = await scaffoldLessons(root);
    expect(result.recallHookTeamHint).toBeNull();
  });
});
