import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LESSONS_GRAPH_PATH } from '../../../src/lessons/graph-store.js';
import { mayStageLessonsGraph } from '../../../src/lessons/git-staging-command.js';

const start = join(tmpdir(), 'am-staging-proj');
const graphFile = join(start, LESSONS_GRAPH_PATH);
const stages = (command: string): boolean => mayStageLessonsGraph(command, start, graphFile);
const backslashed = (path: string): string => path.replaceAll('/', '\\');
const posixEscaped = (path: string): string => path.replace(/[\s"'`$\\;&|()<>*?[#~!{}]/g, '\\$&');

describe('mayStageLessonsGraph — commands that can stage lessons.json', () => {
  it.each([
    'git add -A',
    'git add --all',
    'git add -u',
    'git add --update',
    'git add -Av',
    'git add .',
    'git add ./',
    'git add -p',
    'git add --pathspec-from-file=list.txt',
    'git stage -A',
    'git add .agentsmesh',
    'git add .agentsmesh/lessons',
    'git add .agentsmesh/lessons/lessons.json',
    'git add ./.agentsmesh/lessons/lessons.json',
    'git add -- .agentsmesh/lessons/lessons.json',
    'git add src/a.ts .agentsmesh/lessons/lessons.json',
    'git add :/',
    'git add *',
    "git add 'src/[a'",
    'git add *.json',
    'git add .agentsmesh/*',
    `git add ${graphFile}`,
    `git add ${start}`,
    'git add ..',
    'git add -v .agentsmesh/lessons/lessons.json',
    'git add packages/app/.agentsmesh/lessons/lessons.json',
    'git --no-pager commit -m x',
    'git commit -m "x"',
    'git commit -am x',
    'git commit -a',
    'git commit --amend --no-edit',
    'git merge --continue',
    'git rebase --continue',
    'git cherry-pick --continue',
    'git revert --continue',
  ])('%s', (command) => {
    expect(stages(command)).toBe(true);
  });

  it.each([
    'pnpm test && git add -A && git commit -m x',
    'cd app; git commit -m x',
    'git status | cat; git add .',
    '(git add -A)',
    'FOO=1 git commit -m x',
    'git -C . add -A',
    'git -c core.editor=true rebase --continue',
    '/usr/bin/git commit -m x',
    'time git commit -m x',
    'git status\ngit add -A',
    'git status && \\\n  git commit -m x',
    'bash -c "git add -A && git commit -m x"',
    "sh -c 'git merge --continue'",
    'cd packages/app && git add .agentsmesh/lessons/lessons.json',
    'cd .agentsmesh && git add lessons/lessons.json',
    'false || git commit -m x',
    'echo done & git commit -m x',
  ])('finds it inside a compound command: %s', (command) => {
    expect(stages(command)).toBe(true);
  });
});

describe('mayStageLessonsGraph — commands that cannot', () => {
  it.each([
    '',
    'ls',
    'pnpm test',
    'npm run commit',
    'git status',
    'git diff',
    'git log -1',
    'git add',
    'git add src/a.ts',
    'git add src/ docs',
    'git add src/{a,b}.ts',
    'git add *.ts',
    'git add src/*.ts',
    'git add :!src',
    'git add .agentsmesh/rules/a.md',
    'git add .agentsmesh/lessons/other.json',
    'git add lessons',
    'git add ../other',
    'git add --verbose src/x.ts',
    'git add -v src/x.ts',
    'git --no-pager log',
    'FOO=1',
    'bash ./deploy.sh',
    'git merge feature',
    'git merge --abort',
    'git rebase main',
    'git rebase --abort',
    'git cherry-pick abc123',
    'git checkout main',
    'git stash',
    'git commit-tree HEAD',
    'gitk',
    'echo "git add -A"',
    "echo 'git commit'",
    'git log --grep="git add -A"',
    'grep -r "git commit" .',
    'git status # then git add -A',
    'bash -c "git status"',
    'git -C app status',
  ])('%s', (command) => {
    expect(stages(command)).toBe(false);
  });

  it('does not stage from a directory below the project', () => {
    expect(mayStageLessonsGraph('git add .', join(start, 'src'), graphFile)).toBe(false);
  });
});

describe('mayStageLessonsGraph — a command that may have changed directory', () => {
  it('matches the project-relative graph path from a folder below the project', () => {
    const command = 'git add .agentsmesh/lessons/lessons.json';
    expect(mayStageLessonsGraph(command, join(start, 'src'), graphFile)).toBe(true);
  });
});

describe('mayStageLessonsGraph — backslash paths', () => {
  it.each([
    'git add .agentsmesh\\lessons\\lessons.json',
    'git add .\\.agentsmesh\\lessons\\lessons.json',
    'git add .agentsmesh\\lessons',
    'git add src\\a.ts .agentsmesh\\lessons\\lessons.json',
    `git add ${backslashed(graphFile)}`,
    `git add ${backslashed(start)}`,
    'git add ".agentsmesh\\lessons\\lessons.json"',
    `git add "${backslashed(graphFile)}"`,
    'git add "a\\"b" .agentsmesh/lessons/lessons.json',
    'git commit -m "wip\\',
  ])('keeps the backslash as a path separator: %s', (command) => {
    expect(stages(command)).toBe(true);
  });

  it.each([
    'git add src\\a.ts',
    'git add .agentsmesh\\rules\\a.md',
    'git add .agentsmesh\\lessons\\other.json',
    'git add my\\ dir/file',
    'git add .agentsmesh/lessons/lessons.json\\ copy',
    'echo a\\; git commit -m x',
    'echo "a\\"; git commit"',
  ])('still reads a backslash before a shell character as an escape: %s', (command) => {
    expect(stages(command)).toBe(false);
  });

  it('reads every POSIX escape in an absolute path', () => {
    const odd = join(tmpdir(), "am odd $x (1);&#~!{a}[b]`'");
    const command = `git add ${posixEscaped(odd)}`;
    expect(mayStageLessonsGraph(command, start, join(odd, LESSONS_GRAPH_PATH))).toBe(true);
  });
});
