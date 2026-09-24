/**
 * A recall hook that calls a global `agentsmesh` fails for any teammate who
 * lacks a global install, and the host hides that failure from the model. The
 * hint tells the team how to make recall work for everyone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECALL_HOOK_TEAM_HINT,
  recallHookTeamHint,
} from '../../../src/lessons/recall-hook-hint.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recall-hint-'));
  mkdirSync(join(root, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function pkg(content: unknown): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify(content));
}
function hooks(yaml: string): void {
  writeFileSync(join(root, '.agentsmesh', 'hooks.yaml'), yaml, 'utf8');
}
const RECALL =
  'PreToolUse:\n  - matcher: Edit\n    type: command\n    command: agentsmesh lessons hook\n';
const NPX_RECALL = 'npx --no --offline agentsmesh lessons hook';

describe('recallHookTeamHint', () => {
  it('returns the hint when recall is wired and agentsmesh is not a project dependency', () => {
    pkg({ devDependencies: { vitest: '^4.0.0' } });
    hooks(RECALL);
    expect(recallHookTeamHint(root)).toBe(RECALL_HOOK_TEAM_HINT);
    expect(RECALL_HOOK_TEAM_HINT).toBe(
      "Lessons recall hooks call a global agentsmesh: teammates without a global install will not get lesson recall; add agentsmesh as a devDependency and re-run 'agentsmesh init --lessons'.",
    );
  });

  it('asks to update an npx-launched entry once the dependency is gone', () => {
    pkg({});
    hooks(RECALL.replace('agentsmesh lessons hook', NPX_RECALL));
    expect(recallHookTeamHint(root)).toBe(
      `Lessons recall hooks run \`${NPX_RECALL}\`, but this project now calls ` +
        "`agentsmesh lessons hook`; re-run 'agentsmesh init --lessons' to update them.",
    );
  });

  it('asks to update a bare entry once agentsmesh is a project dependency', () => {
    pkg({ devDependencies: { agentsmesh: '^0.41.0' } });
    hooks(RECALL);
    expect(recallHookTeamHint(root)).toBe(
      'Lessons recall hooks run `agentsmesh lessons hook`, but this project now calls ' +
        `\`${NPX_RECALL}\`; re-run 'agentsmesh init --lessons' to update them.`,
    );
  });

  it('returns null when the entry already matches the dependency', () => {
    pkg({ devDependencies: { agentsmesh: '^0.41.0' } });
    hooks(RECALL.replace('agentsmesh lessons hook', NPX_RECALL));
    expect(recallHookTeamHint(root)).toBeNull();
  });

  it('returns null without a package.json, where a devDependency is not the fix', () => {
    hooks(RECALL);
    expect(recallHookTeamHint(root)).toBeNull();
  });

  it('returns null when hooks.yaml has only user hooks', () => {
    pkg({});
    hooks('PreToolUse:\n  - matcher: Edit\n    type: command\n    command: npm run lint\n');
    expect(recallHookTeamHint(root)).toBeNull();
  });

  it('returns null when there is no hooks.yaml or it does not parse', () => {
    pkg({});
    expect(recallHookTeamHint(root)).toBeNull();
    hooks('PreToolUse: [unclosed\n');
    expect(recallHookTeamHint(root)).toBeNull();
  });
});
