import { describe, expect, it } from 'vitest';
import { renderLessons } from '../../../../src/cli/renderers/lessons.js';
import { renderResolve } from '../../../../src/cli/renderers/lessons-render-resolve.js';
import type { LessonsResolveData } from '../../../../src/cli/commands/lessons-types.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

const data = (over: Partial<LessonsResolveData> = {}): LessonsResolveData => ({
  source: 'index',
  path: '.agentsmesh/lessons/lessons.json',
  lessonCount: 3,
  onlyOurs: 1,
  onlyTheirs: 2,
  introduced: [],
  baseKnown: true,
  nextStep: 'merge',
  ...over,
});

describe('renderResolve', () => {
  const output = useCapturedOutput();

  it('says what it combined and the next step, without staging anything', () => {
    renderResolve(data());
    const all = output.stdout() + output.stderr();
    expect(all).toContain(
      'Resolved .agentsmesh/lessons/lessons.json from the git merge stages: 3 lessons ' +
        '(1 only on this branch, 2 only on the incoming branch).',
    );
    expect(all).toContain('Next: git add .agentsmesh/lessons/lessons.json');
    expect(all).not.toContain('warn');
  });

  it('names the marker source, singular counts, and warns about new validation errors', () => {
    renderResolve(
      data({ source: 'markers', lessonCount: 1, onlyOurs: 0, onlyTheirs: 1, introduced: ['E: x'] }),
    );
    const all = output.stdout() + output.stderr();
    expect(all).toContain('from the conflict markers in the file: 1 lesson (0 only on');
    expect(all).toContain('E: x');
    expect(all).toContain('agentsmesh lessons validate');
  });

  it.each([
    [
      'merge',
      '  Next: git add .agentsmesh/lessons/lessons.json, then finish the merge (git commit).',
    ],
    ['rebase', '  Next: git add .agentsmesh/lessons/lessons.json, then git rebase --continue.'],
    [
      'cherry-pick',
      '  Next: git add .agentsmesh/lessons/lessons.json, then git cherry-pick --continue.',
    ],
    ['revert', '  Next: git add .agentsmesh/lessons/lessons.json, then git revert --continue.'],
    ['none', '  Next: git add .agentsmesh/lessons/lessons.json and commit the fix.'],
  ] as const)('names the next git step for %s', (nextStep, line) => {
    renderResolve(data({ nextStep }));
    expect(output.stdout()).toContain(`${line}\n`);
  });

  it('prints no git step outside a git repository', () => {
    renderResolve(data({ nextStep: null }));
    expect(output.stdout() + output.stderr()).not.toContain('Next:');
  });

  it('warns that a deletion may come back when the markers had no base', () => {
    renderResolve(data({ source: 'markers', baseKnown: false }));
    expect(output.stderr()).toContain(
      'The conflict markers carry no merge base, so a trigger or topic that one branch deleted ' +
        'may be back. Check with `agentsmesh lessons validate`; set `git config ' +
        'merge.conflictStyle diff3` so later conflicts keep the base.',
    );
  });

  it('is what `agentsmesh lessons resolve` prints', () => {
    renderLessons({ subcommand: 'resolve', exitCode: 0, data: data() });
    expect(output.stdout() + output.stderr()).toContain(
      'Resolved .agentsmesh/lessons/lessons.json',
    );
  });
});
