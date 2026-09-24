/**
 * Windsurf scopes a `trigger: glob` rule with `globs:`, a string with one
 * pattern or several joined by commas (docs.devin.ai/desktop/cascade/memories;
 * its language server turns that string into a list). A singular `glob:` is not
 * read, so rules written with it never activated. Import reads every form real
 * files use, and the documented unquoted value no longer aborts it.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { runImport } from '../../../../src/cli/commands/import.js';
import {
  formatWindsurfGlobs,
  parseWindsurfGlobs,
} from '../../../../src/targets/windsurf/rule-globs.js';
import { splitFrontmatter } from '../../../../src/utils/text/markdown.js';
import { logger } from '../../../../src/utils/output/logger.js';

let root: string;

const write = (rel: string, text: string): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');
const globsOf = (rel: string): unknown =>
  (parseYaml(splitFrontmatter(read(rel))?.yaml ?? '') as { globs?: unknown }).globs;
const canonicalRule = (name: string, globs: string): void =>
  write(`.agentsmesh/rules/${name}.md`, `---\ndescription: d\nglobs: ${globs}\n---\n# R\n`);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-windsurf-globs-')));
  write('agentsmesh.yaml', 'version: 1\ntargets: [windsurf]\nfeatures: [rules]\n');
  write('.agentsmesh/rules/_root.md', '---\nroot: true\n---\n# Root\n');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('Windsurf rule globs', () => {
  it('generates globs, never glob, as one comma-joined string', async () => {
    canonicalRule('one', '["src/**/*.ts"]');
    canonicalRule('two', '["src/**/*.ts", "tests/**/*.ts"]');
    canonicalRule('star', '["**/*.css"]');

    await runGenerate({}, root, { printMatrix: false });

    expect([
      read('.windsurf/rules/one.md'),
      read('.windsurf/rules/two.md'),
      read('.windsurf/rules/star.md'),
    ]).toEqual([
      '---\ndescription: d\ntrigger: glob\nglobs: src/**/*.ts\n---\n\n# R',
      '---\ndescription: d\ntrigger: glob\nglobs: src/**/*.ts,tests/**/*.ts\n---\n\n# R',
      '---\ndescription: d\ntrigger: glob\nglobs: "**/*.css"\n---\n\n# R',
    ]);
  });

  it('imports every globs form real Windsurf rules use, and the older glob', async () => {
    write('AGENTS.md', '# Root\n');
    write('.windsurf/rules/docs.md', '---\ntrigger: glob\nglobs: **/*.css,**/*.tsx\n---\nA\n');
    write('.windsurf/rules/spaced.md', '---\ntrigger: glob\nglobs: **/*.rb, Rakefile\n---\nB\n');
    write('.windsurf/rules/brace.md', '---\ntrigger: glob\nglobs: src/**/*.{ts,tsx}\n---\nC\n');
    write('.windsurf/rules/list.md', '---\ntrigger: glob\nglobs: ["src/main/**/*.java"]\n---\nD\n');
    write('.windsurf/rules/old.md', '---\ntrigger: glob\nglob: "lib/**"\n---\nE\n');

    await runImport({ from: 'windsurf' }, root);

    expect(
      ['docs', 'spaced', 'brace', 'list', 'old'].map((n) => globsOf(`.agentsmesh/rules/${n}.md`)),
    ).toEqual([
      ['**/*.css', '**/*.tsx'],
      ['**/*.rb', 'Rakefile'],
      ['src/**/*.{ts,tsx}'],
      ['src/main/**/*.java'],
      ['lib/**'],
    ]);
  });

  it('round-trips several globs, braces included, through generate and import', async () => {
    canonicalRule('mix', '["src/**/*.{ts,tsx}", "tests/**"]');

    await runGenerate({}, root, { printMatrix: false });
    await runImport({ from: 'windsurf' }, root);

    expect(globsOf('.agentsmesh/rules/mix.md')).toEqual(['src/**/*.{ts,tsx}', 'tests/**']);
  });

  it('skips a rule whose frontmatter still cannot be read, and imports the rest', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    write('AGENTS.md', '# Root\n');
    write('.windsurf/rules/bad.md', '---\ntrigger: [unclosed\n---\nBAD\n');
    write('.windsurf/rules/good.md', '---\ntrigger: glob\nglobs: src/**\n---\nGOOD\n');

    await runImport({ from: 'windsurf' }, root);

    expect(globsOf('.agentsmesh/rules/good.md')).toEqual(['src/**']);
    expect(warn.mock.calls.map(([m]) => String(m).split(':')[0])).toEqual([
      'Skipping .windsurf/rules/bad.md',
    ]);
  });
});

describe('formatWindsurfGlobs and parseWindsurfGlobs', () => {
  it('join with commas and split only outside braces', () => {
    expect(formatWindsurfGlobs(['a/**', 'b/*.{x,y}'])).toBe('a/**,b/*.{x,y}');
    expect([
      parseWindsurfGlobs(' a/** , b/*.{x,y} ,'),
      parseWindsurfGlobs(['a/**', 3, ' b ']),
      parseWindsurfGlobs(undefined),
    ]).toEqual([['a/**', 'b/*.{x,y}'], ['a/**', 'b'], []]);
  });
});
