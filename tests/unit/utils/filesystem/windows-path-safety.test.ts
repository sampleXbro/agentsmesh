import { describe, expect, it } from 'vitest';
import { findWindowsPathIssues } from '../../../../src/utils/filesystem/windows-path-safety.js';

const isWindowsSafePath = (path: string): boolean => findWindowsPathIssues(path).length === 0;

describe('isWindowsSafePath', () => {
  it('accepts ordinary POSIX-style relative paths emitted by generators', () => {
    expect(isWindowsSafePath('.cursor/rules/team.mdc')).toBe(true);
    expect(isWindowsSafePath('.github/copilot-instructions.md')).toBe(true);
    expect(isWindowsSafePath('.codex/config.toml')).toBe(true);
    expect(isWindowsSafePath('.claude/skills/api-generator/SKILL.md')).toBe(true);
  });

  it('accepts Windows-style separators in the input path', () => {
    expect(isWindowsSafePath('.cursor\\rules\\team.mdc')).toBe(true);
  });

  it('rejects every Windows reserved device name regardless of extension or case', () => {
    expect(isWindowsSafePath('rules/con.md')).toBe(false);
    expect(isWindowsSafePath('rules/PRN.md')).toBe(false);
    expect(isWindowsSafePath('rules/Aux.txt')).toBe(false);
    expect(isWindowsSafePath('rules/nul')).toBe(false);
    for (let n = 1; n <= 9; n++) {
      expect(isWindowsSafePath(`rules/com${n}.md`)).toBe(false);
      expect(isWindowsSafePath(`rules/lpt${n}.md`)).toBe(false);
    }
  });

  it('rejects every Windows-reserved character', () => {
    for (const ch of ['<', '>', ':', '"', '|', '?', '*']) {
      expect(isWindowsSafePath(`rules/foo${ch}bar.md`)).toBe(false);
    }
  });

  it('rejects trailing dot or trailing space in any segment', () => {
    expect(isWindowsSafePath('rules/foo./bar.md')).toBe(false);
    expect(isWindowsSafePath('rules/foo /bar.md')).toBe(false);
    expect(isWindowsSafePath('rules/bar.md.')).toBe(false);
  });

  it('rejects ASCII control characters but accepts ordinary unicode letters', () => {
    const bell = String.fromCharCode(7);
    expect(isWindowsSafePath(`rules/foo${bell}bar.md`)).toBe(false);
    expect(isWindowsSafePath('rules/résumé.md')).toBe(true);
  });

  it('reports the offending segment and reason for each issue', () => {
    expect(findWindowsPathIssues('rules/con.md/notes.md')).toEqual([
      { segment: 'con.md', reason: 'reserved-name' },
    ]);
    expect(findWindowsPathIssues('rules/foo:bar.md')).toEqual([
      { segment: 'foo:bar.md', reason: 'illegal-character' },
    ]);
    expect(findWindowsPathIssues('rules/foo./bar.md')).toEqual([
      { segment: 'foo.', reason: 'trailing-dot-or-space' },
    ]);
  });
});
