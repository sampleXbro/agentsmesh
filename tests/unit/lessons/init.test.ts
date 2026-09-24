import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldLessons } from '../../../src/lessons/init.js';
import { lessonsPaths } from '../../../src/lessons/paths.js';
import { defaultLessonsConfig } from '../../../src/lessons/recall-config.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'lessons-init-'));
});

describe('scaffoldLessons', async () => {
  it('creates lessons.json and injects the managed ritual block into _root.md', async () => {
    const result = await scaffoldLessons(projectRoot);
    const paths = lessonsPaths(projectRoot);

    expect(existsSync(paths.graph)).toBe(true);
    const graph = JSON.parse(readFileSync(paths.graph, 'utf8')) as Record<string, unknown>;
    expect(graph).toEqual({ lessons: {}, topics: {}, triggers: {}, version: 2 });

    const rootRule = readFileSync(join(projectRoot, '.agentsmesh/rules/_root.md'), 'utf8');
    expect(rootRule).toContain('<!-- agentsmesh:lessons-contract:start -->');
    expect(rootRule).toContain('<!-- agentsmesh:lessons-contract:end -->');
    expect(rootRule).toContain('## Lessons (BLOCKING)');
    expect(rootRule).toContain('Lesson: none');

    // No legacy artifacts.
    expect(existsSync(paths.journal)).toBe(false);
    expect(existsSync(paths.index)).toBe(false);
    expect(existsSync(paths.topicsDir)).toBe(false);

    const skillPath = join(projectRoot, '.agentsmesh/skills/lessons/SKILL.md');
    expect(result.created).toEqual([paths.graph, paths.config, skillPath]);
    expect(result.rootRuleUpdated).toBe(true);
    // No hooks.yaml in this bare scaffold, so the recall hook is a no-op here;
    // injection-into-an-existing-hooks.yaml is covered by recall-hook-scaffold +
    // the init --lessons e2e (where init creates hooks.yaml first).
    expect(result.recallHookInjected).toBe(false);
  });

  it('injects the recall hook when hooks.yaml already exists', async () => {
    mkdirSync(join(projectRoot, '.agentsmesh'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agentsmesh/hooks.yaml'),
      '# yaml-language-server: $schema=./x.json\n',
      'utf8',
    );
    const result = await scaffoldLessons(projectRoot);
    expect(result.recallHookInjected).toBe(true);
    expect(readFileSync(join(projectRoot, '.agentsmesh/hooks.yaml'), 'utf8')).toContain(
      'agentsmesh lessons hook',
    );
  });

  it('seeds the Tier-2 lessons skill with canonical frontmatter', async () => {
    await scaffoldLessons(projectRoot);
    const skillPath = join(projectRoot, '.agentsmesh/skills/lessons/SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf8');
    expect(content.startsWith('---\nname: lessons\n')).toBe(true);
    // The manual enumerates the full command surface (compact list).
    expect(content).toContain('agentsmesh lessons query');
    expect(content).toMatch(/\bimport-md\b/);
  });

  it('is idempotent — re-running keeps a single block and reports graph + skill skipped', async () => {
    await scaffoldLessons(projectRoot);
    const second = await scaffoldLessons(projectRoot);

    const rootRule = readFileSync(join(projectRoot, '.agentsmesh/rules/_root.md'), 'utf8');
    const starts = rootRule.match(/<!-- agentsmesh:lessons-contract:start -->/g) ?? [];
    expect(starts.length).toBe(1);

    const skillPath = join(projectRoot, '.agentsmesh/skills/lessons/SKILL.md');
    const paths = lessonsPaths(projectRoot);
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([paths.graph, paths.config, skillPath]);
    expect(second.rootRuleUpdated).toBe(false);
  });

  it('refreshes a stale/drifted lessons skill — it is a managed artifact, not user-owned', async () => {
    const skillPath = join(projectRoot, '.agentsmesh/skills/lessons/SKILL.md');
    mkdirSync(join(projectRoot, '.agentsmesh/skills/lessons'), { recursive: true });
    const stale = '---\nname: lessons\ndescription: old manual\n---\n\nOutdated body.\n';
    writeFileSync(skillPath, stale, 'utf8');

    const result = await scaffoldLessons(projectRoot);

    // Rewritten to the current manual (like the Tier-1 paragraph), reported as updated.
    expect(readFileSync(skillPath, 'utf8')).not.toBe(stale);
    expect(readFileSync(skillPath, 'utf8')).toContain('# Lessons — operating manual');
    expect(result.updated).toContain(skillPath);
    expect(result.created).not.toContain(skillPath);
    expect(result.skipped).not.toContain(skillPath);
  });

  it('leaves an already-current lessons skill untouched (reported skipped, not updated)', async () => {
    await scaffoldLessons(projectRoot);
    const second = await scaffoldLessons(projectRoot);
    const skillPath = join(projectRoot, '.agentsmesh/skills/lessons/SKILL.md');
    expect(second.skipped).toContain(skillPath);
    expect(second.updated).toEqual([]);
  });

  it('appends the block to an existing root rule without disturbing other content', async () => {
    mkdirSync(join(projectRoot, '.agentsmesh/rules'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agentsmesh/rules/_root.md'),
      '---\nroot: true\ndescription: ""\n---\n\n# Existing\n\n## Custom Section\n\nKeep me.\n',
      'utf8',
    );

    await scaffoldLessons(projectRoot);

    const rootRule = readFileSync(join(projectRoot, '.agentsmesh/rules/_root.md'), 'utf8');
    expect(rootRule).toContain('## Custom Section');
    expect(rootRule).toContain('Keep me.');
    expect(rootRule).toContain('<!-- agentsmesh:lessons-contract:start -->');
  });

  it('gitignores every lessons runtime artifact — logs, the lock dir and crash temp files', async () => {
    const result = await scaffoldLessons(projectRoot);

    const lines = readFileSync(join(projectRoot, '.gitignore'), 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines).toEqual([
      '.agentsmesh/lessons/recall-log.jsonl',
      '.agentsmesh/lessons/capture-log.jsonl',
      '.agentsmesh/lessons/outcome-log.jsonl',
      '.agentsmesh/lessons/.lessons.lock/',
      '.agentsmesh/lessons/*.tmp',
    ]);
    expect(result.gitignoreUpdated).toBe(true);
  });

  it('binds lessons.json to the merge driver in .gitattributes (committable, idempotent)', async () => {
    const first = await scaffoldLessons(projectRoot);
    expect(first.gitattributesUpdated).toBe(true);
    const attrs = readFileSync(join(projectRoot, '.gitattributes'), 'utf8');
    expect(attrs).toContain('.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons');

    const second = await scaffoldLessons(projectRoot);
    expect(second.gitattributesUpdated).toBe(false);
    const lines = readFileSync(join(projectRoot, '.gitattributes'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() === '.agentsmesh/lessons/lessons.json merge=agentsmesh-lessons');
    expect(lines.length).toBe(1);
  });

  it('appends the recall-log entry idempotently — re-running adds it once, reports no second update', async () => {
    await scaffoldLessons(projectRoot);
    const second = await scaffoldLessons(projectRoot);

    const matches = readFileSync(join(projectRoot, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l === '.agentsmesh/lessons/recall-log.jsonl');
    expect(matches.length).toBe(1);
    expect(second.gitignoreUpdated).toBe(false);
  });

  it('preserves existing .gitignore content when appending the recall-log entry', async () => {
    writeFileSync(join(projectRoot, '.gitignore'), 'node_modules\ndist\n', 'utf8');

    await scaffoldLessons(projectRoot);

    const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('dist');
    expect(gitignore).toContain('.agentsmesh/lessons/recall-log.jsonl');
  });

  it('skips the recall-log entry when a broader .agentsmesh/ ignore already covers it', async () => {
    writeFileSync(join(projectRoot, '.gitignore'), 'node_modules\n.agentsmesh/\n', 'utf8');

    const result = await scaffoldLessons(projectRoot);

    expect(readFileSync(join(projectRoot, '.gitignore'), 'utf8')).not.toContain('recall-log.jsonl');
    expect(result.gitignoreUpdated).toBe(false);
  });

  it('writes config.json materializing every tunable at its default value', async () => {
    const result = await scaffoldLessons(projectRoot);
    const configPath = lessonsPaths(projectRoot).config;

    expect(result.created).toContain(configPath);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(parsed).toEqual(defaultLessonsConfig());
    // Materialized defaults must equal the in-code defaults — writing them out is
    // behaviour-neutral, only discoverability changes.
    expect(parsed).toEqual({
      recallLimit: 10,
      recallMaxTokens: 1200,
      autoPrune: false,
      telemetry: false,
      outcomeLog: true,
    });
  });

  it('never overwrites an existing config.json — user edits are preserved (reported skipped)', async () => {
    mkdirSync(join(projectRoot, '.agentsmesh/lessons'), { recursive: true });
    const configPath = lessonsPaths(projectRoot).config;
    writeFileSync(configPath, JSON.stringify({ recallLimit: 3, autoPrune: true }), 'utf8');

    const result = await scaffoldLessons(projectRoot);

    expect(result.created).not.toContain(configPath);
    expect(result.skipped).toContain(configPath);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      recallLimit: 3,
      autoPrune: true,
    });
  });
});
