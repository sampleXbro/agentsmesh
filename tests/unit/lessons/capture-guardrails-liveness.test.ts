import { describe, expect, it } from 'vitest';
import {
  type GuardrailWarning,
  inspectCapturedLesson,
} from '../../../src/lessons/capture-guardrails.js';
import { filesWith, graphWith } from '../../helpers/lessons-liveness-fixture.js';

function liveness(warnings: GuardrailWarning[]): GuardrailWarning[] {
  return warnings.filter((w) => w.code === 'DEAD_GLOB' || w.code === 'PENDING_GLOB');
}

describe('inspectCapturedLesson — glob liveness (knownPaths supplied)', () => {
  it('warns DEAD_GLOB ("likely a rename") when git history renamed the path away', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/renamed/**/*.ts' } });
    const out = liveness(
      inspectCapturedLesson(g, 'L', filesWith(['src/here.ts'], ['src/renamed/a.ts'])),
    );
    expect(out.map((w) => w.code)).toEqual(['DEAD_GLOB']);
    expect(out[0]!.message).toContain('(src/renamed/**/*.ts)');
    expect(out[0]!.message).toContain('likely a rename');
  });

  it('warns PENDING_GLOB, not DEAD_GLOB, for a path git never removed (not created yet)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/api/refunds.ts' } });
    const out = liveness(inspectCapturedLesson(g, 'L', filesWith(['src/here.ts'])));
    expect(out.map((w) => w.code)).toEqual(['PENDING_GLOB']);
    expect(out[0]!.message).toContain('(src/api/refunds.ts)');
    expect(out[0]!.message).toContain('does not exist yet');
    expect(out[0]!.message).toContain('will fire once it does');
    expect(out[0]!.message).not.toContain('rename');
  });

  it('warns PENDING_GLOB when there is no git evidence at all (plain set / non-git project)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/renamed/**/*.ts' } });
    const out = liveness(inspectCapturedLesson(g, 'L', new Set(['src/here.ts'])));
    expect(out.map((w) => w.code)).toEqual(['PENDING_GLOB']);
  });

  it('does not warn when the glob matches a known path', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/**/*.ts' } });
    expect(liveness(inspectCapturedLesson(g, 'L', filesWith(['src/here.ts'])))).toEqual([]);
  });

  it('is skipped entirely when knownPaths is omitted (the pure write-barrier path)', () => {
    const g = graphWith({ f: { kind: 'file_glob', pattern: 'src/renamed/**/*.ts' } });
    expect(liveness(inspectCapturedLesson(g, 'L'))).toEqual([]);
  });
});
