import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsFlags } from '../../../../src/cli/commands/lessons-helpers.js';
import { lessonsGraphProblem, problemFromLoad } from '../../../../src/lessons/graph-problem.js';
import {
  graphFilePath,
  loadLessonsGraphResilient,
  saveLessonsGraph,
  serializeGraph,
} from '../../../../src/lessons/graph-store.js';
import {
  CONFLICTED_GRAPH_TEXT,
  lesson,
  writeGraphText,
} from '../../../helpers/lessons-graph-fixture.js';
import {
  clearEnv,
  commitAll,
  git,
  GIT_HOOK_ENV,
  initRepo,
  tryGit,
  writeFile,
} from '../../../helpers/temp-git-repo.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-graph-problem-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const COMMANDS: Array<[string, LessonsFlags, string[]]> = [
  ['add', { topic: 't', 'trigger-file': 'src/**' }, ['add', 'A rule.']],
  ['topics', {}, ['topics']],
  ['show', {}, ['show', 't']],
  ['deprecate', {}, ['deprecate', 'x']],
  ['prune', {}, ['prune']],
  ['prune --apply', { apply: true }, ['prune']],
  ['journal', {}, ['journal']],
  ['stats', {}, ['stats']],
  ['merge', {}, ['merge', 'a', 'b']],
  ['untrigger', {}, ['untrigger', 'a', 'g']],
  ['strip-markers', {}, ['strip-markers']],
];

const UNREADABLE: Array<[string, string]> = [
  ['conflict markers', CONFLICTED_GRAPH_TEXT],
  ['broken JSON', '{ not json'],
  [
    'a newer version',
    `${JSON.stringify({ version: 99, lessons: {}, topics: {}, triggers: {} })}\n`,
  ],
  ['null', 'null\n'],
  ['an array', '[]\n'],
];

describe.each(UNREADABLE)('lessons subcommands on a graph with %s', (_label, text) => {
  it.each(COMMANDS)(
    '%s fails with the shared graph guidance (exit 1) and keeps the file',
    async (_name, flags, args) => {
      writeGraphText(root, text);
      const problem = problemFromLoad(root, loadLessonsGraphResilient(root));
      expect(problem).not.toBeNull();
      const r = await runLessons(flags, args, root);
      expect(r.exitCode).toBe(1);
      expect(r.error).toBe(problem!.message);
      expect(readFileSync(graphFilePath(root), 'utf8')).toBe(text);
    },
  );
});

describe('lessons subcommands on a readable graph', () => {
  it('keep their own failure message', async () => {
    saveLessonsGraph(root, { version: 2, lessons: {}, topics: {}, triggers: {} });
    const r = await runLessons({}, ['deprecate', 'no-such-id'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/^Unknown lesson/);
  });
});

describe('lessons subcommands during an unfinished git merge', () => {
  let restoreEnv: () => void;
  beforeAll(() => {
    restoreEnv = clearEnv(GIT_HOOK_ENV);
  });
  afterAll(() => restoreEnv());

  it('keep their own failure message while the graph file reads fine', async () => {
    const GRAPH = '.agentsmesh/lessons/lessons.json';
    const graph = (ids: string[]): string =>
      serializeGraph({
        version: 2,
        lessons: Object.fromEntries(ids.map((id) => [id, lesson(`Rule ${id}.`)])),
        topics: { t: { summary: 'T.' } },
        triggers: {},
      });
    initRepo(root);
    writeFile(root, GRAPH, graph(['l0']));
    commitAll(root, 'base');
    git(root, ['checkout', '-q', '-b', 'feature']);
    writeFile(root, GRAPH, graph(['l0', 'b']));
    commitAll(root, 'theirs');
    git(root, ['checkout', '-q', 'main']);
    writeFile(root, GRAPH, graph(['l0', 'a']));
    commitAll(root, 'ours');
    const merge = tryGit(root, ['merge', '--no-edit', 'feature']);
    expect(merge.stdout).toContain('CONFLICT (content)');
    // One side written back by hand: parses fine, but git still holds it unmerged.
    writeFile(root, GRAPH, graph(['l0', 'a']));
    expect(lessonsGraphProblem(root)).not.toBeNull();

    const r = await runLessons({}, ['deprecate', 'no-such-id'], root);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/^Unknown lesson/);
  });
});
