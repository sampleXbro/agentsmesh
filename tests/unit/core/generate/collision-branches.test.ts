import { describe, expect, it } from 'vitest';
import {
  refreshResultStatus,
  resolveOutputCollisions,
} from '../../../../src/core/generate/collision.js';
import type { GenerateResult } from '../../../../src/core/types.js';

function makeResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
  return {
    target: 'claude-code',
    path: '.claude/CLAUDE.md',
    content: '# Root',
    status: 'created',
    ...overrides,
  };
}

describe('resolveOutputCollisions — extra branches', () => {
  it('keeps unique results untouched (no collision path)', () => {
    const a = makeResult({ path: 'a.md' });
    const b = makeResult({ path: 'b.md', target: 'cursor' });
    expect(resolveOutputCollisions([a, b])).toEqual([a, b]);
  });

  it('falls through to codex-richer branch when codex covers every line of the other', () => {
    // Substring containment fails (the shared line is reordered), but codex
    // carries every line the other target does, so it is genuinely richer.
    const codex = makeResult({
      target: 'codex-cli',
      path: 'AGENTS.md',
      content: 'codex specific A\ncursor data\n',
    });
    const cursor = makeResult({
      target: 'cursor',
      path: 'AGENTS.md',
      content: 'cursor data\n\n',
    });

    const out = resolveOutputCollisions([cursor, codex]);
    expect(out).toHaveLength(1);
    expect(out[0]?.target).toBe('codex-cli');
  });

  it('throws instead of dropping a body whose lines codex does not carry', () => {
    // The old rule picked whichever body was byte-longer, so the other
    // target's content vanished with no message.
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cursor', path: 'AGENTS.md', content: 'cursor data\n' }),
        makeResult({
          target: 'codex-cli',
          path: 'AGENTS.md',
          content: 'codex specific A\ncodex specific B\n',
        }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('returns null richerCodex (throws) when neither is codex and no superset', () => {
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cline', path: 'AGENTS.md', content: 'foo\n' }),
        makeResult({ target: 'windsurf', path: 'AGENTS.md', content: 'bar\n' }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('returns null richerAgents when both are equal length but different content (no containment)', () => {
    // Even path AGENTS.md and same length, but neither contains the other -> both branches null.
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cline', path: 'AGENTS.md', content: 'AAA\n' }),
        makeResult({ target: 'windsurf', path: 'AGENTS.md', content: 'BBB\n' }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('returns null richerAgents when content is empty', () => {
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cline', path: 'AGENTS.md', content: '   ' }),
        makeResult({ target: 'windsurf', path: 'AGENTS.md', content: 'data' }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('returns null richerAgents when paths do not end with AGENTS.md', () => {
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cline', path: 'a.md', content: 'foo' }),
        makeResult({ target: 'windsurf', path: 'a.md', content: 'foo bar' }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('throws on case-only path collisions (Windows/macOS clobber)', () => {
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'cursor', path: '.cursor/commands/Build.md', content: 'a' }),
        makeResult({ target: 'cursor', path: '.cursor/commands/build.md', content: 'b' }),
      ]),
    ).toThrow(/case-only path collision/i);
  });

  it('returns codex when codex content equal length to other (no codex win)', () => {
    // codex content has equal length to other → codex richer returns null → throws.
    expect(() =>
      resolveOutputCollisions([
        makeResult({ target: 'codex-cli', path: 'AGENTS.md', content: 'AAA\n' }),
        makeResult({ target: 'cline', path: 'AGENTS.md', content: 'BBB\n' }),
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });
});

describe('refreshResultStatus — branches', () => {
  it('returns same instance when status already matches computed status', () => {
    const r = makeResult({ currentContent: '# Root', content: '# Root', status: 'unchanged' });
    expect(refreshResultStatus(r)).toBe(r);
  });

  it('changes status from unchanged to created when no current content', () => {
    const r = makeResult({ currentContent: undefined, status: 'unchanged' });
    expect(refreshResultStatus(r).status).toBe('created');
  });

  it('changes status to updated when content differs from current', () => {
    const r = makeResult({ currentContent: '# Old', content: '# New', status: 'created' });
    expect(refreshResultStatus(r).status).toBe('updated');
  });
});
