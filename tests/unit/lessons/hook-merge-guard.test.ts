import { afterEach, describe, expect, it, vi } from 'vitest';

const problem = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../../src/lessons/graph-problem.js', () => ({ problemFromLoadAndGit: problem.fn }));

import { mergeStagingNotice } from '../../../src/lessons/hook-merge-guard.js';

const root = process.cwd();
afterEach(() => problem.fn.mockReset());

describe('mergeStagingNotice', () => {
  it('prefixes the conflict message with the instruction not to stage yet', () => {
    problem.fn.mockReturnValue({ kind: 'conflict', message: 'Run resolve first.' });
    expect(mergeStagingNotice(root, root, 'git add -A')).toBe(
      'agentsmesh lessons: do not stage or commit yet. Run resolve first.',
    );
  });

  it('is silent for a graph problem that is not a merge conflict', () => {
    problem.fn.mockReturnValue({ kind: 'corrupt', message: 'Broken.' });
    expect(mergeStagingNotice(root, root, 'git add -A')).toBeNull();
  });

  it('is silent when there is no problem', () => {
    problem.fn.mockReturnValue(null);
    expect(mergeStagingNotice(root, root, 'git commit -m x')).toBeNull();
  });

  it('does not look at git for a command that cannot stage, or for no command', () => {
    problem.fn.mockReturnValue({ kind: 'conflict', message: 'x' });
    expect(mergeStagingNotice(root, root, 'git status')).toBeNull();
    expect(mergeStagingNotice(root, root, undefined)).toBeNull();
    expect(problem.fn).not.toHaveBeenCalled();
  });

  it('never throws', () => {
    problem.fn.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(mergeStagingNotice(root, root, 'git add -A')).toBeNull();
  });
});
