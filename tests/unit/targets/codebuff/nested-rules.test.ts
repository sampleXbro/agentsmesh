/**
 * Nested `<dir>/AGENTS.md` is a SHARED file: Codex CLI walks the same
 * directories and writes the same path, but filters rules differently
 * (`codexEmit: execution` goes to `.codex/rules/*.rules`,
 * `codexInstructionVariant: override` goes to `<dir>/AGENTS.override.md`, and
 * `rule.targets` may exclude either tool).
 *
 * `resolveOutputCollisions` keeps ONE file per path: it prefers the string that
 * literally CONTAINS the other, and otherwise falls back to picking the longer
 * of the two for a codex-vs-other conflict — which silently drops the shorter
 * side's rules, and throws outright on an exact length tie. Codebuff therefore
 * orders every nested group so that Codex's exact string stays a contiguous
 * PREFIX of Codebuff's whenever Codex has no rules Codebuff omits.
 */

import { describe, it, expect } from 'vitest';
import { generateRules } from '../../../../src/targets/codebuff/generator.js';
import { generateRules as generateCodexRules } from '../../../../src/targets/codex-cli/generator/rules.js';
import { lintRules } from '../../../../src/targets/codebuff/linter.js';
import { makeCanonical, makeRule } from './factories.js';
import {
  renderEmbeddedRuleEntries,
  takeEmbeddedRuleEntries,
} from '../../../../src/targets/projection/embedded-rule-entries.js';

function nested(outputs: { path: string; content: string }[], path: string): string {
  return outputs.find((output) => output.path === path)?.content ?? '';
}

const SRC = ['src/**'];

describe('nested AGENTS.md stays byte-compatible with codex-cli', () => {
  it('keeps the codex string contiguous when an override rule sits between two shared rules', () => {
    const canonical = makeCanonical({
      rules: [
        makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' }),
        makeRule({
          source: '/p/o.md',
          globs: SRC,
          body: 'OOO',
          codexInstructionVariant: 'override',
        }),
        makeRule({ source: '/p/b.md', globs: SRC, body: 'BBB' }),
      ],
    });

    const codex = nested(generateCodexRules(canonical), 'src/AGENTS.md');
    const codebuff = nested(generateRules(canonical), 'src/AGENTS.md');

    expect(codex).toBe(renderEmbeddedRuleEntries([canonical.rules[0]!, canonical.rules[2]!]));
    expect(codebuff).toContain('OOO');
    expect(codebuff).toContain(codex);
  });

  it('keeps the codex string contiguous when an execution rule sits between two shared rules', () => {
    const canonical = makeCanonical({
      rules: [
        makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' }),
        makeRule({ source: '/p/x.md', globs: SRC, body: 'XXX', codexEmit: 'execution' }),
        makeRule({ source: '/p/b.md', globs: SRC, body: 'BBB' }),
      ],
    });

    const codex = nested(generateCodexRules(canonical), 'src/AGENTS.md');
    const codebuff = nested(generateRules(canonical), 'src/AGENTS.md');

    expect(codex).toBe(renderEmbeddedRuleEntries([canonical.rules[0]!, canonical.rules[2]!]));
    expect(codebuff).toContain(codex);
  });

  it('keeps the codex string contiguous when a codebuff-only rule sits between two shared rules', () => {
    const canonical = makeCanonical({
      rules: [
        makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' }),
        makeRule({ source: '/p/s.md', globs: SRC, body: 'SSS', targets: ['codebuff'] }),
        makeRule({ source: '/p/b.md', globs: SRC, body: 'BBB' }),
      ],
    });

    const codex = nested(generateCodexRules(canonical), 'src/AGENTS.md');
    const codebuff = nested(generateRules(canonical), 'src/AGENTS.md');

    expect(codex).toBe(renderEmbeddedRuleEntries([canonical.rules[0]!, canonical.rules[2]!]));
    expect(codebuff).toContain(codex);
  });

  it('still emits every eligible rule exactly once', () => {
    const canonical = makeCanonical({
      rules: [
        makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' }),
        makeRule({ source: '/p/x.md', globs: SRC, body: 'XXX', codexEmit: 'execution' }),
        makeRule({
          source: '/p/o.md',
          globs: SRC,
          body: 'OOO',
          codexInstructionVariant: 'override',
        }),
        makeRule({ source: '/p/b.md', globs: SRC, body: 'BBB' }),
      ],
    });

    const content = nested(generateRules(canonical), 'src/AGENTS.md');
    expect(
      takeEmbeddedRuleEntries(content)
        .rules.map((rule) => rule.body)
        .sort(),
    ).toEqual(['AAA', 'BBB', 'OOO', 'XXX']);
  });

  it('excludes a rule targeted away from codebuff', () => {
    const canonical = makeCanonical({
      rules: [makeRule({ source: '/p/c.md', globs: SRC, body: 'CCC', targets: ['codex-cli'] })],
    });

    expect(generateRules(canonical)).toEqual([]);
  });
});

describe('lintRules warns that a nested AGENTS.md cannot honour a targets filter', () => {
  const files = ['src/index.ts', 'docs/readme.md'];
  const root = makeRule({ source: '/p/_root.md', root: true, body: '# Root' });

  // Only the shared-nested-file diagnostics; glob/root checks come from validateRules.
  function lint(
    rules: ReturnType<typeof makeRule>[],
    options?: { scope: 'project' | 'global' },
  ): ReturnType<typeof lintRules> {
    return lintRules(makeCanonical({ rules: [root, ...rules] }), '/p', files, options).filter((d) =>
      d.file.endsWith('/AGENTS.md'),
    );
  }

  it('is silent for unfiltered scoped rules', () => {
    expect(lint([makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' })])).toEqual([]);
  });

  it('names the codebuff-targeted rules whose filter leaks into a shared file', () => {
    const diagnostics = lint([
      makeRule({ source: '/p/secret.md', globs: SRC, body: 'SSS', targets: ['codebuff'] }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ level: 'warning', target: 'codebuff' });
    expect(diagnostics[0]!.message).toContain('src/AGENTS.md');
    expect(diagnostics[0]!.message).toContain('secret.md');
  });

  it('names a rule targeted away from codebuff that contests the same nested file', () => {
    const diagnostics = lint([
      makeRule({ source: '/p/a.md', globs: SRC, body: 'AAA' }),
      makeRule({ source: '/p/other.md', globs: SRC, body: 'CCC', targets: ['codex-cli'] }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('other.md');
    expect(diagnostics[0]!.message).toContain('src/AGENTS.md');
  });

  it('reports both a leak and a contest for the same nested file', () => {
    const diagnostics = lint([
      makeRule({ source: '/p/mine.md', globs: SRC, body: 'SSS', targets: ['codebuff'] }),
      makeRule({ source: '/p/theirs.md', globs: SRC, body: 'CCC', targets: ['codex-cli'] }),
    ]);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.file === 'src/AGENTS.md')).toBe(true);
    expect(diagnostics[0]!.message).toContain('mine.md');
    expect(diagnostics[1]!.message).toContain('theirs.md');
  });

  it('groups several leaked rules under one diagnostic per nested file', () => {
    const diagnostics = lint([
      makeRule({ source: '/p/one.md', globs: SRC, body: 'AAA', targets: ['codebuff'] }),
      makeRule({ source: '/p/two.md', globs: SRC, body: 'BBB', targets: ['codebuff'] }),
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('one.md, two.md');
  });

  it('stays silent for a rule targeted away from codebuff in a directory codebuff never writes', () => {
    expect(
      lint([
        makeRule({
          source: '/p/other.md',
          globs: ['docs/**'],
          body: 'CCC',
          targets: ['codex-cli'],
        }),
      ]),
    ).toEqual([]);
  });

  it('stays silent in global scope, where scoped rules embed into ~/.AGENTS.md', () => {
    expect(
      lint([makeRule({ source: '/p/secret.md', globs: SRC, body: 'SSS', targets: ['codebuff'] })], {
        scope: 'global',
      }),
    ).toEqual([]);
  });
});
