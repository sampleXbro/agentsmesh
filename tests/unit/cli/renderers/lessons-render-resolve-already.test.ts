import { describe, expect, it } from 'vitest';
import type { LessonsResolveData } from '../../../../src/cli/commands/lessons-types.js';
import { renderLessons } from '../../../../src/cli/renderers/lessons.js';
import { renderResolve } from '../../../../src/cli/renderers/lessons-render-resolve.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

const data = (over: Partial<LessonsResolveData> = {}): LessonsResolveData => ({
  source: 'index',
  path: '.agentsmesh/lessons/lessons.json',
  lessonCount: 3,
  onlyOurs: 1,
  onlyTheirs: 1,
  introduced: [],
  baseKnown: true,
  nextStep: 'merge',
  ...over,
});

describe('renderResolve — a file that was already resolved', () => {
  const output = useCapturedOutput();

  it('says nothing was changed and still names the next git step', () => {
    renderResolve({ ...data(), alreadyResolved: true });
    expect(output.stdout() + output.stderr()).toBe(
      '✓ .agentsmesh/lessons/lessons.json is already resolved: it holds all 3 lessons from both ' +
        'branches, so it was left unchanged.\n' +
        '  Next: git add .agentsmesh/lessons/lessons.json, then finish the merge (git commit).\n',
    );
  });

  it('keeps the base and validation warnings out: nothing was rebuilt', () => {
    renderResolve({
      ...data({ lessonCount: 1, baseKnown: false, introduced: ['E: x'], nextStep: null }),
      alreadyResolved: true,
    });
    expect(output.stdout() + output.stderr()).toBe(
      '✓ .agentsmesh/lessons/lessons.json is already resolved: it holds all 1 lesson from both ' +
        'branches, so it was left unchanged.\n',
    );
  });

  it('is what `agentsmesh lessons resolve` prints', () => {
    const resolved = { ...data(), alreadyResolved: true };
    renderLessons({ subcommand: 'resolve', exitCode: 0, data: resolved });
    expect(output.stdout()).toContain('is already resolved');
  });
});

describe('renderResolve — a merge base that could not be read', () => {
  const output = useCapturedOutput();

  it('blames the git merge base, not the markers, when the stages were used', () => {
    renderResolve(data({ baseKnown: false }));
    expect(output.stderr()).toBe(
      '⚠ The merge base in git could not be read, so a trigger or topic that one branch deleted ' +
        'may be back. Check with `agentsmesh lessons validate`.\n',
    );
  });
});
