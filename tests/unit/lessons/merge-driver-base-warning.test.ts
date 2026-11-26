/**
 * The merge driver reads a base it cannot parse as empty. It still writes the
 * best union and exits 0 (nothing is lost), but it must say so on stderr.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doMergeDriver } from '../../../src/cli/commands/lessons-merge-driver-handler.js';
import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';

const BOM = '\uFEFF';
let dir: string;
let stderr: string[];
const p = (name: string): string => join(dir, name);
const text = (lessons: Record<string, Lesson>, version = 2): string =>
  JSON.stringify({ version, lessons, topics: { t: { summary: 'T.' } }, triggers: {} });
const lessonIds = (): string[] =>
  Object.keys((JSON.parse(readFileSync(p('ours'), 'utf8')) as LessonsGraph).lessons).sort();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-driver-base-'));
  stderr = [];
  process.env.NO_COLOR = '1';
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  writeFileSync(p('ours'), text({ a: lesson('Ours A.') }));
  writeFileSync(p('theirs'), text({ b: lesson('Theirs B.') }));
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NO_COLOR;
  rmSync(dir, { recursive: true, force: true });
});

describe('lessons merge driver — a base it cannot read', () => {
  it('writes the union, exits 0, and warns on stderr', () => {
    writeFileSync(p('base'), '{ this is not json');
    const r = doMergeDriver([p('base'), p('ours'), p('theirs')]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
    expect(lessonIds()).toEqual(['a', 'b']);
    expect(stderr.join('')).toMatch(
      /^⚠ lessons merge-driver: The common ancestor of \.agentsmesh\/lessons\/lessons\.json could not be read \(.+\), so it was treated as empty\. Both branches were combined and no lesson was lost, but a trigger or topic that one branch deleted may be back\. Check with `agentsmesh lessons validate`\.\n$/,
    );
  });

  it('warns for a base written by a newer schema, and still unions', () => {
    writeFileSync(p('base'), text({}, 9));
    expect(doMergeDriver([p('base'), p('ours'), p('theirs')]).exitCode).toBe(0);
    expect(lessonIds()).toEqual(['a', 'b']);
    expect(stderr.join('')).toContain('could not be read (schema version 9)');
  });

  it.each(['', '\n'])('stays silent for an empty ancestor (%j)', (base) => {
    writeFileSync(p('base'), base);
    expect(doMergeDriver([p('base'), p('ours'), p('theirs')]).exitCode).toBe(0);
    expect(lessonIds()).toEqual(['a', 'b']);
    expect(stderr).toEqual([]);
  });

  it('stays silent for a readable base', () => {
    writeFileSync(p('base'), text({}));
    expect(doMergeDriver([p('base'), p('ours'), p('theirs')]).exitCode).toBe(0);
    expect(stderr).toEqual([]);
  });
});

describe('lessons merge driver — a BOM in the files git hands over', () => {
  it('unions three BOM-prefixed files instead of writing conflict markers', () => {
    writeFileSync(p('base'), `${BOM}${text({})}`);
    writeFileSync(p('ours'), `${BOM}${text({ a: lesson('Ours A.') })}`);
    writeFileSync(p('theirs'), `${BOM}${text({ b: lesson('Theirs B.') })}`);
    const r = doMergeDriver([p('base'), p('ours'), p('theirs')]);
    expect(r.exitCode).toBe(0);
    expect(lessonIds()).toEqual(['a', 'b']);
    expect(stderr).toEqual([]);
  });
});
