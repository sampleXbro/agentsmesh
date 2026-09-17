import { describe, expect, it } from 'vitest';
import type { LessonsGraph, Trigger } from '../../../src/lessons/graph-schema.js';
import { ineffectiveTriggers } from '../../../src/lessons/trigger-effectiveness.js';

function graphWith(triggers: Record<string, Trigger>): LessonsGraph {
  return { version: 1, lessons: {}, topics: {}, triggers };
}

describe('ineffectiveTriggers', () => {
  it('flags a stopword keyword whose needle loses tokens (dead on --file/--cmd)', () => {
    const g = graphWith({ k: { kind: 'keyword', pattern: 'state of the art' } });
    const out = ineffectiveTriggers(g, ['k']);
    expect(out.map((t) => t.id)).toEqual(['k']);
    expect(out[0]!.reason).toMatch(/file\/--cmd|stopword/i);
  });

  it('flags an all-stopword / zero-token keyword (no matchable token at all)', () => {
    const g = graphWith({ k: { kind: 'keyword', pattern: 'of the' } });
    expect(ineffectiveTriggers(g, ['k']).map((t) => t.id)).toEqual(['k']);
  });

  it('does NOT flag a stopword-free multi-word keyword', () => {
    const g = graphWith({ k: { kind: 'keyword', pattern: 'windows paths' } });
    expect(ineffectiveTriggers(g, ['k'])).toEqual([]);
  });

  it('does NOT flag a distinctive single-word keyword', () => {
    const g = graphWith({ k: { kind: 'keyword', pattern: 'auth' } });
    expect(ineffectiveTriggers(g, ['k'])).toEqual([]);
  });

  it('flags an invalid command_pattern regex (recall swallows the throw as a non-match)', () => {
    const g = graphWith({ c: { kind: 'command_pattern', pattern: '(' } });
    const out = ineffectiveTriggers(g, ['c']);
    expect(out.map((t) => t.id)).toEqual(['c']);
    expect(out[0]!.reason).toMatch(/invalid/i);
  });

  it('flags a command_pattern the linear engine cannot run (lookaround/backreference)', () => {
    // Valid regex syntax, but the non-backtracking recall engine cannot evaluate
    // a lookbehind, so recall skips it (fail-closed) and it never fires.
    const g = graphWith({ c: { kind: 'command_pattern', pattern: '(?<=x)y' } });
    expect(ineffectiveTriggers(g, ['c']).map((t) => t.id)).toEqual(['c']);
  });

  it('does NOT flag a valid, safe command_pattern', () => {
    const g = graphWith({ c: { kind: 'command_pattern', pattern: 'pnpm test' } });
    expect(ineffectiveTriggers(g, ['c'])).toEqual([]);
  });

  it('never flags a file_glob (file globs are effective in B scope; liveness is warn-only)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'does/not/exist/**' } });
    expect(ineffectiveTriggers(g, ['f'])).toEqual([]);
  });

  it('skips a missing trigger id rather than crashing', () => {
    expect(ineffectiveTriggers(graphWith({}), ['nope'])).toEqual([]);
  });

  it('isolates the dead trigger in a mixed good+dead set', () => {
    const g = graphWith({
      f: { kind: 'file_glob', pattern: 'src/auth.ts' },
      k: { kind: 'keyword', pattern: 'state of the art' },
    });
    expect(ineffectiveTriggers(g, ['f', 'k']).map((t) => t.id)).toEqual(['k']);
  });
});
