/**
 * E2E: recall safety + leanness through the real binary —
 *   - ReDoS guard: a command_pattern the linear engine cannot run is a dead
 *     trigger (alone: unrecallable, exit 2); recall never executes one.
 *   - work budget: command matching stops (fails closed) at the query budget.
 *   - default token budget: a broad match is trimmed by the default budget
 *     unless `--all` is passed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, runCliArgs } from './helpers/run-cli.js';
import { addLessonCli } from './helpers/lessons-cli.js';
import { DEFAULT_RECALL_MAX_TOKENS } from '../../src/lessons/ranking.js';
import { COMMAND_MATCH_BUDGET } from '../../src/lessons/query.js';
import { compileLinearMatcher } from '../../src/lessons/regex-linear/index.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'am-lessons-safety-e2e-'));
});

afterEach(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe('lessons CLI — ReDoS guard (P1, linear engine)', () => {
  // Patterns the non-backtracking engine cannot evaluate (backreference /
  // lookaround) or that expand too large (state amplification / ε-chain blowup)
  // are dead triggers: alone they make the capture unrecallable (exit 2).
  it.each(['(a)\\1', '(?=foo)bar', '(?<!x)y', 'a{1000}'.repeat(10), '(){1000}'.repeat(5)])(
    'rejects a capture with an unsupported command_pattern %j',
    async (pattern) => {
      const r = await runCliArgs(
        [
          'lessons',
          'add',
          'bad rule',
          '--topic',
          'sec',
          '--new-topic',
          '--topic-summary',
          's',
          '--trigger-cmd',
          pattern,
        ],
        dir,
      );
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('no effective trigger');
      expect(r.stderr).toContain('outside the provably-linear engine');
    },
  );

  // Backtracking-shaped patterns are ACCEPTED — the linear engine runs them safely.
  it.each(['(a+)+$', '(a|aa)+$', 'a+a+$', 'a+b'])(
    'accepts a backtracking-shaped command_pattern %j (linear engine)',
    async (pattern) => {
      const r = await runCliArgs(
        [
          'lessons',
          'add',
          'shaped rule',
          '--topic',
          'sec',
          '--new-topic',
          '--topic-summary',
          's',
          '--trigger-cmd',
          pattern,
        ],
        dir,
      );
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Added lesson');
    },
  );

  it('recall on a 30k-char adversarial command stops at the query work budget', async () => {
    // a{1,100}b keeps ~100 NFA threads alive per char, so this matching input
    // costs more than the query-wide budget: the linear engine stops and fails
    // closed. A backtracking RegExp, or any path that skips the budget, matches it.
    const pattern = 'a{1,100}b';
    const id = await addLessonCli(dir, 'budget-bound rule', {
      topic: 'sec',
      newTopic: true,
      summary: 's',
      extra: ['--trigger-cmd', pattern],
    });
    const adversarial = 'a'.repeat(30_000) + 'b';
    expect(linearWork(pattern, adversarial)).toBeGreaterThan(COMMAND_MATCH_BUDGET);

    expect(await recalledIds('aaab')).toEqual([id]);
    expect(await recalledIds(adversarial)).toEqual([]);
  });
});

async function recalledIds(command: string): Promise<string[]> {
  const r = await runCliArgs(['lessons', 'query', '--cmd', command, '--format', 'json'], dir);
  expect(r.exitCode).toBe(0);
  return (JSON.parse(r.stdout) as { lessons: { id: string }[] }).lessons.map((l) => l.id);
}

/** NFA work units the linear engine spends on `input`, with no budget cap. */
function linearWork(pattern: string, input: string): number {
  const budget = { remaining: Number.MAX_SAFE_INTEGER };
  compileLinearMatcher(pattern)!.test(input, budget);
  return Number.MAX_SAFE_INTEGER - budget.remaining;
}

describe('lessons CLI — corrupt graph resilience (P1)', () => {
  // Recall is a BLOCKING REQUIREMENT before every edit/command, so a corrupt
  // canonical graph must NOT crash the real binary — it degrades to empty + warn.
  it('does not crash on a corrupt lessons.json — exits 0 with a warning, no matches', async () => {
    const graphDir = join(dir, '.agentsmesh', 'lessons');
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, 'lessons.json'), '{ truncated', 'utf8');

    const r = await runCli('lessons query --file src/index.ts --format json', dir);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/recall returned no lessons: .*could not be parsed/);
    const data = JSON.parse(r.stdout) as { lessons: unknown[]; totalMatches: number };
    expect(data.lessons).toEqual([]);
    expect(data.totalMatches).toBe(0);
  });
});

describe('lessons CLI — default token budget (P2)', () => {
  /** A rule costing ~1/6th of the default budget, so the BUDGET trims before the limit does. */
  const filler = 'word '.repeat(Math.ceil((DEFAULT_RECALL_MAX_TOKENS * 2) / 15)).trim();

  async function seedLongLessons(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await addLessonCli(dir, `Long budget rule ${i} ${filler}`, {
        topic: 'budget',
        newTopic: i === 0,
        summary: 'Budget topic',
        extra: ['--trigger-kw', 'budgetkw'],
      });
    }
  }

  it('default query is trimmed by the budget; --all returns the full match set', async () => {
    await seedLongLessons();

    const def = await runCli('lessons query --keyword budgetkw --format json', dir);
    expect(def.exitCode).toBe(0);
    const defData = JSON.parse(def.stdout) as { lessons: unknown[]; totalMatches: number };
    expect(defData.totalMatches).toBe(8);
    expect(defData.lessons.length).toBeLessThan(8); // budget trimmed

    const all = await runCli('lessons query --keyword budgetkw --all --format json', dir);
    const allData = JSON.parse(all.stdout) as { lessons: unknown[] };
    expect(allData.lessons.length).toBe(8);
  });
});
