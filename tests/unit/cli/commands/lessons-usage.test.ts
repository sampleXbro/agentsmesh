import { describe, it, expect } from 'vitest';
import { LESSONS_SUBCOMMANDS, LESSONS_USAGE } from '../../../../src/cli/commands/lessons-usage.js';

/**
 * `LESSONS_USAGE` is the single source of truth for the lessons subcommand
 * surface: every help renderer derives its subcommand list and per-subcommand
 * signature from here. These assertions are intentionally exact (no `some()` /
 * prefix-only) so a new subcommand that forgets a usage entry — or a usage entry
 * for a subcommand the dispatcher does not route — fails CI.
 */
const CANONICAL_SUBCOMMANDS = [
  'query',
  'add',
  'topics',
  'show',
  'deprecate',
  'merge',
  'untrigger',
  'strip-markers',
  'journal',
  'validate',
  'resolve',
  'stats',
  'prune',
  'import-md',
] as const;

describe('LESSONS_SUBCOMMANDS — canonical source of truth', () => {
  it('lists exactly the 14 dispatched subcommands in canonical order', () => {
    expect([...LESSONS_SUBCOMMANDS]).toEqual([...CANONICAL_SUBCOMMANDS]);
  });

  it('LESSONS_USAGE has an entry for every subcommand and no extras', () => {
    expect(Object.keys(LESSONS_USAGE)).toEqual([...CANONICAL_SUBCOMMANDS]);
  });
});

describe('LESSONS_USAGE — per-subcommand signatures', () => {
  it('every usage signature begins with its own `agentsmesh lessons <sub>` invocation', () => {
    for (const sub of CANONICAL_SUBCOMMANDS) {
      expect(LESSONS_USAGE[sub]?.usage.startsWith(`agentsmesh lessons ${sub}`)).toBe(true);
    }
  });

  it('surfaces required positionals — `show` documents its <topic|lesson-id> argument', () => {
    expect(LESSONS_USAGE.show?.usage).toBe('agentsmesh lessons show <topic|lesson-id>');
  });

  it('carries the parenthetical summaries for the annotated subcommands', () => {
    expect(LESSONS_USAGE.untrigger?.summary).toBe('detach a trigger; GCs it if now unused');
    expect(LESSONS_USAGE.stats?.summary).toMatch(/telemetry/i);
    expect(LESSONS_USAGE.prune?.summary).toMatch(/dry-run by default/i);
  });

  it('documents the previously-undocumented per-subcommand flags in the signatures', () => {
    expect(LESSONS_USAGE.add?.usage).toContain('--rationale');
    expect(LESSONS_USAGE['strip-markers']?.usage).toContain('--dry-run');
    expect(LESSONS_USAGE.stats?.usage).toContain('--json');
    expect(LESSONS_USAGE.prune?.usage).toContain('--apply');
    expect(LESSONS_USAGE.prune?.usage).toContain('--cap');
  });
});
