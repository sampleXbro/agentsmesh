/**
 * Read-only command classification.
 *
 * The shipped lessons rule has always promised that pure-read commands are
 * exempt from the recall ritual, but nothing in the hook path implemented it.
 * The result was a failure log dominated by read-only classes (`cmd:cat`,
 * `cmd:grep`, `cmd:find f`) and a "RECURRENT FAILURE ... failed 5x before"
 * banner on commands that cannot fail destructively — a `grep` that exits 1
 * because it matched nothing is not a failure worth escalating.
 *
 * The classifier is deliberately conservative: a false negative only restores
 * today's behaviour, while a false positive would swallow a real failure.
 */

import { describe, it, expect } from 'vitest';
import { isReadOnlyCommand } from '../../../src/lessons/read-only-command.js';

describe('isReadOnlyCommand', () => {
  it.each([
    'cat README.md',
    'ls -la src/',
    'grep -rn foo src/',
    'rg --files',
    'head -20 package.json',
    'tail -f /var/log/x',
    'wc -l src/index.ts',
    'find . -name "*.ts"',
    'sed -n "1,20p" file.ts',
    'awk "{print $1}" data.txt',
    'jq .name package.json',
    'echo hello',
    'pwd',
  ])('treats %s as read-only', (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  it.each([
    'git status',
    'git log --oneline -5',
    'git show HEAD',
    'git diff --cached',
    'git ls-files',
    'git rev-parse HEAD',
  ])('treats %s as read-only', (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  it.each([
    'rm -rf build',
    'npm install',
    'node script.js',
    'python3 script.py',
    'git commit -m x',
    'git checkout main',
    'git push',
    'mv a b',
    'cp a b',
    'mkdir -p out',
    'chmod +x run.sh',
    './run.sh',
  ])('treats %s as state-changing', (command) => {
    expect(isReadOnlyCommand(command)).toBe(false);
  });

  it('classifies every segment of a pipeline, not just the first', () => {
    expect(isReadOnlyCommand('cat a.txt | grep foo | wc -l')).toBe(true);
    expect(isReadOnlyCommand('cat a.txt | tee out.txt')).toBe(false);
    expect(isReadOnlyCommand('grep -rn x src/ && rm -rf build')).toBe(false);
    expect(isReadOnlyCommand('ls; npm publish')).toBe(false);
  });

  it('treats output redirection to a path as state-changing', () => {
    expect(isReadOnlyCommand('cat a.txt > b.txt')).toBe(false);
    expect(isReadOnlyCommand('grep foo src/ >> log.txt')).toBe(false);
  });

  it('still exempts a read-only command that silences stderr', () => {
    expect(isReadOnlyCommand('cat missing 2>/dev/null')).toBe(true);
    expect(isReadOnlyCommand('grep foo src/ 2>&1')).toBe(true);
  });

  it('treats an in-place or executing flag as state-changing', () => {
    expect(isReadOnlyCommand('sed -i "s/a/b/" file.ts')).toBe(false);
    expect(isReadOnlyCommand('find . -name "*.tmp" -delete')).toBe(false);
    expect(isReadOnlyCommand('find . -name "*.ts" -exec rm {} ;')).toBe(false);
  });

  it('ignores leading environment assignments', () => {
    expect(isReadOnlyCommand('FOO=1 grep -rn x src/')).toBe(true);
    expect(isReadOnlyCommand('FOO=1 rm -rf build')).toBe(false);
  });

  it('treats an unknown or empty program as state-changing', () => {
    expect(isReadOnlyCommand('')).toBe(false);
    expect(isReadOnlyCommand('   ')).toBe(false);
    expect(isReadOnlyCommand('somecustomtool --check')).toBe(false);
  });

  it('does not exempt a git subcommand that writes', () => {
    expect(isReadOnlyCommand('git config user.name x')).toBe(false);
    expect(isReadOnlyCommand('git stash')).toBe(false);
  });
});
