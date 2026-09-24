import { describe, expect, it } from 'vitest';
import { commandClass } from '../../../src/lessons/command-class.js';
import { contextKey, normalizeCommand } from '../../../src/lessons/context-key.js';

describe('normalizeCommand — reduce a command to its stable class', () => {
  it('keeps program + subcommand, drops flags and quoted args', () => {
    expect(normalizeCommand("git commit -m 'wip'")).toBe('git commit');
    expect(normalizeCommand('npm run test --watch')).toBe('npm run');
    // Past a flag a bare word is an operand, not a subcommand.
    expect(normalizeCommand('rm -rf build')).toBe('rm');
    expect(normalizeCommand('rm -rf dist')).toBe(normalizeCommand('rm -rf build'));
  });
  it('drops path-like tokens', () => {
    expect(normalizeCommand('tsc --noEmit src/x.ts')).toBe('tsc');
    expect(normalizeCommand('node ./scripts/build.mjs')).toBe('node');
  });
  it('keys a path-shaped program on its basename', () => {
    expect(normalizeCommand('./run.sh --all')).toBe('run.sh');
    expect(normalizeCommand('node_modules/.bin/vitest run x.test.ts')).toBe('vitest run');
  });
  it('strips leading env assignments so env-var variants share one class', () => {
    expect(normalizeCommand('FOO=bar npm test')).toBe('npm test');
    expect(normalizeCommand('A=1 B=2 npm run build')).toBe(normalizeCommand('npm run build'));
  });
  it('is empty for a command that only assigns variables', () => {
    expect(normalizeCommand('FOO=bar')).toBe('');
  });
});

describe('normalizeCommand — compound commands key on the real program', () => {
  it.each([
    ['cd /repo && pnpm tsc --noEmit', 'pnpm tsc'],
    ['cd /repo; git status', 'git status'],
    ['cd a || exit 1', 'exit'],
    ['export CI=1 && npm test', 'npm test'],
    ['set -e\nnpm run build', 'npm run'],
    ['# Check the tree\nls -la', 'ls'],
    ['(cd pkg && make build)', 'make build'],
    ['cat x.log | grep -c ERROR', 'cat'],
    ['for f in *.ts; do grep -n TODO "$f"; done', 'grep'],
    ['pnpm \\\n  --filter web test', 'pnpm test'],
  ])('%s → %s', (command, expected) => {
    expect(normalizeCommand(command)).toBe(expected);
  });

  it('keys a navigation-only command on the navigation program', () => {
    expect(normalizeCommand('cd /repo')).toBe('cd');
    expect(normalizeCommand('cd src && cd ..')).toBe('cd');
  });

  it('never splits inside quotes', () => {
    expect(normalizeCommand('echo "a && b" ; npm test')).toBe('echo');
    expect(normalizeCommand("grep 'x|y' f")).toBe('grep');
  });
});

describe('normalizeCommand — global flags before the subcommand', () => {
  it.each([
    ['pnpm --filter web test', 'pnpm test'],
    ['pnpm -F web -r build', 'pnpm build'],
    ['npx -y vitest run', 'npx vitest'],
    ['npx --package typescript tsc -v', 'npx tsc'],
    ['git -C packages/app commit -m x', 'git commit'],
    ['git --no-pager -c core.pager=cat log', 'git log'],
    ['npm --prefix web run test', 'npm run'],
    ['make -C sub build', 'make build'],
    ['docker --context prod ps', 'docker ps'],
  ])('%s → %s', (command, expected) => {
    expect(normalizeCommand(command)).toBe(expected);
  });

  it('keeps the operand rule for programs without known global flags', () => {
    expect(normalizeCommand('rm -rf build')).toBe('rm');
    expect(normalizeCommand('tsc --noEmit src/x.ts')).toBe('tsc');
  });
});

describe('normalizeCommand — a subcommand is a plain word, never an argument fragment', () => {
  it.each([
    ['sleep 120;', 'sleep'],
    ['node <<EOF\nconst x = 1\nEOF', 'node'],
    ["python3 - <<'PY'\nimport json\nPY", 'python3'],
    ['cat > out.txt <<EOF', 'cat'],
    ['cat README.md', 'cat'],
    ['export TOKEN=abc123 && echo hi', 'echo hi'],
    ["grep foo' src", 'grep'],
  ])('%s → %s', (command, expected) => {
    expect(normalizeCommand(command)).toBe(expected);
  });
});

describe('commandClass — records whether flags sat before the subcommand', () => {
  it('marks a gapped subcommand', () => {
    expect(commandClass('git -C x commit')).toEqual({
      program: 'git',
      subcommand: 'commit',
      gapped: true,
    });
    expect(commandClass('git commit')).toEqual({
      program: 'git',
      subcommand: 'commit',
      gapped: false,
    });
    expect(commandClass('ls')).toEqual({ program: 'ls', gapped: false });
    expect(commandClass('   ')).toBeNull();
  });
});

describe('contextKey — bind an outcome to the concrete action', () => {
  const root = '/proj';
  it('prefers the file (the tighter signal), normalized project-relative', () => {
    expect(contextKey({ file: 'src/db.ts', command: 'git commit' }, root)).toBe('file:src/db.ts');
    expect(contextKey({ file: '/proj/src/db.ts' }, root)).toBe('file:src/db.ts');
  });
  it('falls back to the command class when no file', () => {
    expect(contextKey({ command: "git commit -m 'x'" }, root)).toBe('cmd:git commit');
  });
  it('keys a compound command on the program it really runs, not on cd', () => {
    expect(contextKey({ command: 'cd /proj && pnpm tsc --noEmit' }, root)).toBe('cmd:pnpm tsc');
  });
  it('is "none" when neither file nor command is present', () => {
    expect(contextKey({}, root)).toBe('none');
  });
  it('a delivery and a later failure on the SAME action produce the SAME key', () => {
    const atRecall = contextKey({ file: 'src/db.ts' }, root); // no error yet
    const atFailure = contextKey({ file: 'src/db.ts' }, root); // error lives elsewhere
    expect(atRecall).toBe(atFailure);
  });
});
