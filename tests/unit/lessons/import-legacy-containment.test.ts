import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maybeAutoMigrateLessons } from '../../../src/lessons/auto-migrate.js';
import { importLegacyLessons } from '../../../src/lessons/import-legacy.js';
import { recallLessons } from '../../../src/lessons/recall.js';

const SECRET = 'SECRET-TOKEN-7f3a never share this';
const MIGRATED_AT = '2026-06-05';

let sandbox: string;
let root: string;
let secretFile: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'amesh-legacy-contain-'));
  root = join(sandbox, 'project');
  mkdirSync(join(root, '.agentsmesh/lessons/topics'), { recursive: true });
  mkdirSync(join(sandbox, 'secrets'), { recursive: true });
  mkdirSync(join(root, 'secrets'), { recursive: true });
  secretFile = join(sandbox, 'secrets/private-notes.md');
  const body = `# Notes\n\n## Rules\n\n1. ${SECRET}\n`;
  writeFileSync(secretFile, body, 'utf8');
  writeFileSync(join(root, 'secrets/private-notes.md'), body, 'utf8');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function writeIndex(file: string): void {
  writeFileSync(
    join(root, '.agentsmesh/lessons/index.yaml'),
    [
      'version: 1',
      'clusters:',
      '  - topic: leak',
      `    file: ${JSON.stringify(file)}`,
      '    summary: Leak topic.',
      '    triggers:',
      '      file_globs: ["src/**"]',
      '      command_patterns: []',
      '      keywords: []',
      '',
    ].join('\n'),
    'utf8',
  );
}

function lessonsDirMentionsSecret(): boolean {
  const base = join(root, '.agentsmesh/lessons');
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .some((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(SECRET));
}

function expectLegacyIntactAndNoLeak(): void {
  expect(existsSync(join(root, '.agentsmesh/lessons/index.yaml'))).toBe(true);
  expect(existsSync(join(root, '.agentsmesh/lessons/lessons.json'))).toBe(false);
  expect(lessonsDirMentionsSecret()).toBe(false);
}

describe('importLegacyLessons — topic file containment', () => {
  it.each([
    ['parent traversal', '../secrets/private-notes.md'],
    ['inside project, outside lessons dir', 'secrets/private-notes.md'],
    ['traversal after normalization', '.agentsmesh/lessons/../../secrets/private-notes.md'],
    ['posix absolute', '/etc/private-notes.md'],
    ['windows drive, forward slash', 'C:/secrets/private-notes.md'],
    ['windows drive, backslash', 'C:\\secrets\\private-notes.md'],
    ['windows drive-relative', 'c:secrets.md'],
    ['UNC path', '\\\\server\\share\\private-notes.md'],
    ['backslash traversal', '.agentsmesh\\lessons\\..\\..\\secrets\\private-notes.md'],
  ])('refuses a %s topic path and leaves legacy artifacts intact', async (_label, file) => {
    writeIndex(file);
    await expect(importLegacyLessons(root, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /outside \.agentsmesh\/lessons\/.*legacy artifacts left intact/,
    );
    expectLegacyIntactAndNoLeak();
  });

  it('refuses a host-absolute path to a real file outside the project', async () => {
    writeIndex(secretFile.replaceAll('\\', '/'));
    await expect(importLegacyLessons(root, { migratedAt: MIGRATED_AT })).rejects.toThrow(
      /outside \.agentsmesh\/lessons\//,
    );
    expectLegacyIntactAndNoLeak();
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a topic file that is a symlink escaping the lessons dir',
    async () => {
      symlinkSync(secretFile, join(root, '.agentsmesh/lessons/topics/link.md'));
      writeIndex('.agentsmesh/lessons/topics/link.md');
      await expect(importLegacyLessons(root, { migratedAt: MIGRATED_AT })).rejects.toThrow(
        /outside \.agentsmesh\/lessons\//,
      );
      expectLegacyIntactAndNoLeak();
    },
  );

  it('still migrates a topic file that normalizes to inside the lessons dir', async () => {
    writeFileSync(
      join(root, '.agentsmesh/lessons/topics/ok.md'),
      '# Ok\n\n## Rules\n\n1. Keep the rule inside.\n',
      'utf8',
    );
    writeIndex('.agentsmesh/lessons/topics/../topics/ok.md');
    const report = await importLegacyLessons(root, { migratedAt: MIGRATED_AT });
    expect(report.lessonCount).toBe(1);
  });
});

describe('first recall on a hostile legacy store', () => {
  it('auto-migration refuses, so recall never reads or injects the outside file', async () => {
    writeIndex('../secrets/private-notes.md');
    await expect(maybeAutoMigrateLessons(root)).rejects.toThrow(/outside \.agentsmesh\/lessons\//);
    const result = await recallLessons(root, { file: 'src/x.ts' }, { noDedup: true });
    expect(result.lessons).toEqual([]);
    expectLegacyIntactAndNoLeak();
  });
});
