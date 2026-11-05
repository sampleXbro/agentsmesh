/**
 * A capture can create the graph without `init --lessons` (the MCP tools and a
 * bare `lessons add`), so the first one also keeps the lessons logs, lock and
 * temp files out of git, with the same lines `init --lessons` writes.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLesson } from '../../../src/lessons/capture.js';
import { scaffoldLessons } from '../../../src/lessons/init.js';

const RUNTIME_IGNORES = [
  '.agentsmesh/lessons/recall-log.jsonl',
  '.agentsmesh/lessons/capture-log.jsonl',
  '.agentsmesh/lessons/outcome-log.jsonl',
  '.agentsmesh/lessons/.lessons.lock/',
  '.agentsmesh/lessons/*.tmp',
];

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-capture-ignores-')));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function capture(rule: string): ReturnType<typeof captureLesson> {
  return captureLesson(
    root,
    { rule, topic: 'style', triggers: { files: ['src/a.ts'] } },
    { allowNewTopic: true, topicSummary: 'Code style.' },
  );
}

function gitignoreLines(): string[] {
  return readFileSync(join(root, '.gitignore'), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0);
}

describe('the capture that creates the graph', () => {
  it('writes exactly the lessons runtime lines to a new .gitignore', async () => {
    await capture('Keep exports named.');

    expect(gitignoreLines()).toEqual(RUNTIME_IGNORES);
  });

  it('appends them after the lines already there', async () => {
    writeFileSync(join(root, '.gitignore'), 'node_modules\ndist\n');

    await capture('Keep exports named.');

    expect(gitignoreLines()).toEqual(['node_modules', 'dist', ...RUNTIME_IGNORES]);
  });

  it('writes the same lines as init --lessons', async () => {
    await capture('Keep exports named.');
    const fromCapture = readFileSync(join(root, '.gitignore'), 'utf8');
    rmSync(join(root, '.gitignore'));
    rmSync(join(root, '.agentsmesh'), { recursive: true });

    await scaffoldLessons(root);

    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(fromCapture);
  });
});

describe('a .gitignore that cannot be written', () => {
  it('still saves the lesson', async () => {
    mkdirSync(join(root, '.gitignore'));

    await expect(capture('Keep exports named.')).resolves.toMatchObject({ isNewLesson: true });

    expect(existsSync(join(root, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(true);
  });
});

describe('a capture into an existing graph', () => {
  it('leaves .gitignore alone', async () => {
    await capture('Keep exports named.');
    rmSync(join(root, '.gitignore'));

    await capture('Prefer const over let.');

    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });
});

describe('a capture that is refused', () => {
  it('writes no graph and no .gitignore', async () => {
    await expect(
      captureLesson(root, {
        rule: 'No topic yet.',
        topic: 'missing',
        triggers: { files: ['src/a.ts'] },
      }),
    ).rejects.toThrow();

    expect(existsSync(join(root, '.agentsmesh', 'lessons', 'lessons.json'))).toBe(false);
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });
});
