import { describe, expect, it } from 'vitest';
import { missingGlobState } from '../../../src/lessons/file-glob-liveness.js';
import type { GitPathHistory } from '../../../src/lessons/git-path-history.js';

function history(parts: Partial<Record<keyof GitPathHistory, string[]>>): GitPathHistory {
  return {
    tracked: new Set(parts.tracked ?? []),
    deleted: new Set(parts.deleted ?? []),
    renamedAway: new Set(parts.renamedAway ?? []),
  };
}

describe('missingGlobState (a glob that matches no file on disk)', () => {
  it('is pending without git evidence (non-git directory or unknown history)', () => {
    expect(missingGlobState('src/api/refunds.ts', null)).toBe('pending');
  });

  it('is live when it matches a tracked path (file deleted from disk but not committed)', () => {
    expect(missingGlobState('src/a.ts', history({ tracked: ['src/a.ts'] }))).toBe('live');
    expect(
      missingGlobState(
        'src/**/*.ts',
        history({ tracked: ['src/x/a.ts'], renamedAway: ['src/b.ts'] }),
      ),
    ).toBe('live');
  });

  it('is pending when git history never removed a matching path (not created yet, or ignored output)', () => {
    const h = history({
      tracked: ['src/other.ts'],
      deleted: ['lib/x.ts'],
      renamedAway: ['lib/y.ts'],
    });
    expect(missingGlobState('src/api/refunds.ts', h)).toBe('pending');
    expect(missingGlobState('dist/cli.js', h)).toBe('pending');
    expect(missingGlobState('dist/**', h)).toBe('pending');
  });

  it('is dead when HEAD history deleted or renamed away the exact path', () => {
    expect(missingGlobState('src/doomed.ts', history({ deleted: ['src/doomed.ts'] }))).toBe('dead');
    expect(missingGlobState('src/old.ts', history({ renamedAway: ['src/old.ts'] }))).toBe('dead');
  });

  it('is dead when a wildcard glob only matches paths renamed away (the files moved)', () => {
    expect(missingGlobState('src/old/**/*.ts', history({ renamedAway: ['src/old/a/b.ts'] }))).toBe(
      'dead',
    );
  });

  it('is pending when a wildcard glob only matches deleted paths (files that come and go)', () => {
    // A release deletes every changeset; the next change adds a new one.
    const h = history({ deleted: ['.changeset/lucky-fox.md', '.changeset/brave-owl.md'] });
    expect(missingGlobState('.changeset/*.md', h)).toBe('pending');
  });
});
