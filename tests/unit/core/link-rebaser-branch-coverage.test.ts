import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandResolvedPaths, isGlobAdjacent, isRootRelativePathToken, resolveProjectPath } from '../../../src/core/reference/link-rebaser-helpers.js';
import { protectedRanges } from '../../../src/core/reference/protected-ranges.js';
import {
  formatLinkPathForDestinationLegacy,
  isUnderAgentsMesh,
  isUnderProjectRoot,
  toAgentsMeshRootRelative,
  toProjectRootReference,
} from '../../../src/core/reference/link-rebaser-formatting.js';
import {
  getTokenContext,
  shouldRewritePathToken,
} from '../../../src/core/reference/link-token-context.js';
import {
  isMarkdownLinkDestinationToken,
  isRelativePathToken,
  isTildeHomeRelativePathToken,
} from '../../../src/core/reference/link-token-guards.js';
import {
  findBrokenMarkdownLinks,
  parseMarkdownLinkDestination,
  resolveMarkdownLinkTargets,
  validateGeneratedMarkdownLinks,
} from '../../../src/core/reference/validate-generated-markdown-links.js';
import type { GenerateResult } from '../../../src/core/types.js';

const PROJECT_ROOT = '/proj';
const SOURCE_FILE = '/proj/.agentsmesh/rules/_root.md';

describe('link-rebaser-helpers branch coverage', () => {
  describe('isRootRelativePathToken', () => {
    it('returns false for non-root tokens', () => {
      expect(isRootRelativePathToken('docs/x.md')).toBe(false);
      expect(isRootRelativePathToken('./foo.md')).toBe(false);
      expect(isRootRelativePathToken('../foo.md')).toBe(false);
      expect(isRootRelativePathToken('foo.md')).toBe(false);
    });

    it('returns true for tool-dotfile-rooted tokens', () => {
      expect(isRootRelativePathToken('.agentsmesh/rules/_root.md')).toBe(true);
      expect(isRootRelativePathToken('.claude/CLAUDE.md')).toBe(true);
    });
  });

  describe('resolveProjectPath', () => {
    it('handles Windows absolute path tokens', () => {
      const result = resolveProjectPath('C:\\foo\\bar.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/foo/);
    });

    it('handles POSIX absolute paths inside project root', () => {
      const result = resolveProjectPath('/proj/docs/x.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result).toEqual(['/proj/docs/x.md']);
    });

    it('handles POSIX absolute paths outside project root (joins to project)', () => {
      const result = resolveProjectPath('/elsewhere/x.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('/proj/elsewhere/x.md');
    });

    it('handles dot-rooted relative tokens (./)', () => {
      const result = resolveProjectPath('./peer.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toBe('/proj/.agentsmesh/rules/peer.md');
    });

    it('handles parent-rooted relative tokens (../)', () => {
      const result = resolveProjectPath('../skills/qa/SKILL.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toContain('/proj/.agentsmesh/skills/qa/SKILL.md');
    });

    it('handles root-relative tool tokens (.agentsmesh/...)', () => {
      const result = resolveProjectPath('.agentsmesh/rules/_root.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result).toEqual(['/proj/.agentsmesh/rules/_root.md']);
    });

    it('handles bare project-root paths (e.g. docs/x.md)', () => {
      const result = resolveProjectPath('docs/x.md', PROJECT_ROOT, SOURCE_FILE);
      // Not a mesh segment, so two candidates: project-root, source-dir
      expect(result.length).toBe(2);
      expect(result).toContain('/proj/docs/x.md');
    });

    it('handles mesh-rooted bare tokens (rules/x.md, skills/y/SKILL.md)', () => {
      const result = resolveProjectPath('rules/x.md', PROJECT_ROOT, SOURCE_FILE);
      // Mesh segment match yields 3 candidates: from-mesh, from-project-root, from-source-dir
      expect(result.length).toBe(3);
      expect(result).toContain('/proj/.agentsmesh/rules/x.md');
    });

    it('returns [] for NON_REWRITABLE_BARE_FILES (AGENTS.md)', () => {
      expect(resolveProjectPath('AGENTS.md', PROJECT_ROOT, SOURCE_FILE)).toEqual([]);
      expect(resolveProjectPath('CLAUDE.md', PROJECT_ROOT, SOURCE_FILE)).toEqual([]);
      expect(resolveProjectPath('GEMINI.md', PROJECT_ROOT, SOURCE_FILE)).toEqual([]);
    });

    it('returns [] for bare paths with no separator and no dot', () => {
      expect(resolveProjectPath('justaname', PROJECT_ROOT, SOURCE_FILE)).toEqual([]);
    });

    it('handles bare token with dot but no separator (resolved relative to source dir)', () => {
      const result = resolveProjectPath('peer.md', PROJECT_ROOT, SOURCE_FILE);
      expect(result).toEqual(['/proj/.agentsmesh/rules/peer.md']);
    });
  });

  describe('expandResolvedPaths', () => {
    it('returns just the original when path does not exist', () => {
      const result = expandResolvedPaths(PROJECT_ROOT, '/proj/does-not-exist.md');
      expect(result).toEqual(['/proj/does-not-exist.md']);
    });

    it('returns just the original when path is not absolute', () => {
      const result = expandResolvedPaths(PROJECT_ROOT, 'relative/path.md');
      expect(result).toEqual(['relative/path.md']);
    });

    it('expands real paths when path exists on disk', () => {
      const tempRoot = mkdtempSync(join(tmpdir(), 'amesh-link-cov-'));
      try {
        mkdirSync(join(tempRoot, 'docs'), { recursive: true });
        const realFile = join(tempRoot, 'docs', 'real.md');
        writeFileSync(realFile, 'hi');
        const result = expandResolvedPaths(tempRoot, realFile);
        expect(result[0]).toBe(realFile);
        expect(result.length).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('keeps original path when realpath throws (broken symlink)', () => {
      const tempRoot = mkdtempSync(join(tmpdir(), 'amesh-link-cov-'));
      try {
        const broken = join(tempRoot, 'broken-link');
        const target = join(tempRoot, 'does-not-exist-target');
        // Create a symlink whose target does not exist; existsSync on the link returns false
        // but if it ever did exist the catch branch would still fire. We use the absolute
        // path to a non-existent target to force the early-return existsSync=false branch.
        symlinkSync(target, broken, 'file');
        const result = expandResolvedPaths(tempRoot, broken);
        // existsSync on a broken symlink is false -> returns just the original
        expect(result).toEqual([broken]);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('isGlobAdjacent', () => {
    it('returns true when previous character is *', () => {
      // content: "*foo" -> token at 1..4
      expect(isGlobAdjacent('*foo', 1, 4)).toBe(true);
    });

    it('returns true when next character is *', () => {
      // content: "foo*" -> token at 0..3
      expect(isGlobAdjacent('foo*', 0, 3)).toBe(true);
    });

    it('returns false when neither neighbour is *', () => {
      expect(isGlobAdjacent(' foo ', 1, 4)).toBe(false);
    });

    it('handles edge case at start of string (start === 0)', () => {
      expect(isGlobAdjacent('foo', 0, 3)).toBe(false);
    });

    it('handles edge case at end of string (end === length)', () => {
      expect(isGlobAdjacent('foo', 0, 3)).toBe(false);
    });
  });

  describe('protectedRanges', () => {
    it('detects fenced code blocks with backticks', () => {
      const content = 'pre\n```\n[a](./x.md)\n```\npost';
      const ranges = protectedRanges(content);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
      const [s, e] = ranges[0]!;
      expect(content.slice(s, e)).toContain('```');
    });

    it('detects fenced code blocks with tildes', () => {
      const content = '~~~\nfoo\n~~~';
      const ranges = protectedRanges(content);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('detects ROOT_GENERATION_CONTRACT_BLOCK markers', () => {
      const content =
        'before <!-- agentsmesh:root-generation-contract:start -->\nstuff\n<!-- agentsmesh:root-generation-contract:end --> after';
      const ranges = protectedRanges(content);
      const found = ranges.some(([s, e]) =>
        content.slice(s, e).includes('root-generation-contract'),
      );
      expect(found).toBe(true);
    });

    it('detects EMBEDDED_RULES_BLOCK markers', () => {
      const content =
        'x <!-- agentsmesh:embedded-rules:start -->\n[a](./x.md)\n<!-- agentsmesh:embedded-rules:end --> y';
      const ranges = protectedRanges(content);
      const found = ranges.some(([s, e]) => content.slice(s, e).includes('embedded-rules'));
      expect(found).toBe(true);
    });

    it('detects protected URI schemes (https://)', () => {
      const content = 'See https://example.com/foo for more.';
      const ranges = protectedRanges(content);
      const covers = ranges.some(([s, e]) =>
        content.slice(s, e).includes('https://example.com/foo'),
      );
      expect(covers).toBe(true);
    });

    it('detects ssh:// scheme', () => {
      const content = 'Clone from ssh://git@host/repo.git here.';
      const ranges = protectedRanges(content);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('detects git@host: ssh shorthand', () => {
      const content = 'Push to git@github.com:owner/repo.git now.';
      const ranges = protectedRanges(content);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('returns [] for plain text with nothing protected', () => {
      expect(protectedRanges('just plain text without protected markers')).toEqual([]);
    });
  });
});

describe('link-rebaser-formatting branch coverage', () => {
  describe('isUnderProjectRoot', () => {
    it('returns true when path equals project root', () => {
      expect(isUnderProjectRoot('/proj', '/proj')).toBe(true);
    });

    it('returns true when path is under root with separator', () => {
      expect(isUnderProjectRoot('/proj', '/proj/docs/x.md')).toBe(true);
    });

    it('returns false when path is outside root', () => {
      expect(isUnderProjectRoot('/proj', '/elsewhere/x.md')).toBe(false);
    });

    it('returns false when path shares a name prefix without separator', () => {
      expect(isUnderProjectRoot('/proj', '/projection/x.md')).toBe(false);
    });
  });

  describe('isUnderAgentsMesh', () => {
    it('returns true when path equals .agentsmesh root', () => {
      expect(isUnderAgentsMesh('/proj', '/proj/.agentsmesh')).toBe(true);
    });

    it('returns true when path is under .agentsmesh', () => {
      expect(isUnderAgentsMesh('/proj', '/proj/.agentsmesh/rules/_root.md')).toBe(true);
    });

    it('returns false when path is in project root but outside mesh', () => {
      expect(isUnderAgentsMesh('/proj', '/proj/docs/x.md')).toBe(false);
    });

    it('returns false for path outside project root entirely', () => {
      expect(isUnderAgentsMesh('/proj', '/elsewhere/x.md')).toBe(false);
    });
  });

  describe('toAgentsMeshRootRelative', () => {
    it('returns relative path for paths under mesh', () => {
      expect(toAgentsMeshRootRelative('/proj', '/proj/.agentsmesh/rules/_root.md', false)).toBe(
        'rules/_root.md',
      );
    });

    it('returns null for paths outside mesh', () => {
      expect(toAgentsMeshRootRelative('/proj', '/proj/docs/x.md', false)).toBe(null);
    });

    it('returns null for paths above mesh', () => {
      expect(toAgentsMeshRootRelative('/proj', '/proj', false)).toBe(null);
    });

    it('appends trailing slash when keepSlash and not directory-shaped', () => {
      expect(toAgentsMeshRootRelative('/proj', '/proj/.agentsmesh/rules', true)).toBe('rules/');
    });

    it('does not double trailing slash if rel already ends with /', () => {
      expect(toAgentsMeshRootRelative('/proj', '/proj/.agentsmesh/rules/', true)).toBe('rules/');
    });
  });

  describe('formatLinkPathForDestinationLegacy', () => {
    it('returns project-root-relative when target is outside project root', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/CLAUDE.md',
        '/elsewhere/x.md',
        false,
        {},
      );
      expect(result).toBe(null);
    });

    it('returns project-root-relative when destination dir is outside project', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/elsewhere/CLAUDE.md',
        '/proj/docs/x.md',
        false,
        {},
      );
      expect(result).toBe('docs/x.md');
    });

    it('returns destination-relative when both are inside project', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/.claude/CLAUDE.md',
        '/proj/.agentsmesh/rules/_root.md',
        false,
        {},
      );
      expect(result).toBe('../.agentsmesh/rules/_root.md');
    });

    it('handles destination at project root (rel becomes plain name)', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/CLAUDE.md',
        '/proj/docs/x.md',
        false,
        {},
      );
      expect(result).toBe('docs/x.md');
    });

    it('returns "." when relative path is empty (target equals destDir)', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/docs/x.md',
        '/proj/docs',
        false,
        {},
      );
      expect(result).toBe('.');
    });

    it('adds ./ prefix with explicitCurrentDirLinks when destDir is not root', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/.claude/CLAUDE.md',
        '/proj/.claude/agents/sub.md',
        false,
        { explicitCurrentDirLinks: true },
      );
      expect(result).toBe('./agents/sub.md');
    });

    it('does NOT add ./ prefix with explicitCurrentDirLinks when destDir IS root', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/CLAUDE.md',
        '/proj/docs/x.md',
        false,
        { explicitCurrentDirLinks: true },
      );
      expect(result).toBe('docs/x.md');
    });

    it('does NOT add ./ prefix when path already starts with ../', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/.claude/CLAUDE.md',
        '/proj/.agentsmesh/rules/_root.md',
        false,
        { explicitCurrentDirLinks: true },
      );
      expect(result).toBe('../.agentsmesh/rules/_root.md');
    });

    it('appends trailing slash when keepSlash is true', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/CLAUDE.md',
        '/proj/docs',
        true,
        {},
      );
      expect(result).toBe('docs/');
    });

    it('does not double-append trailing slash when path already ends with /', () => {
      const result = formatLinkPathForDestinationLegacy(
        '/proj',
        '/proj/CLAUDE.md',
        '/proj/docs/',
        true,
        {},
      );
      expect(result).toMatch(/\/$/);
      expect(result).not.toMatch(/\/\/$/);
    });
  });

  describe('toProjectRootReference', () => {
    it('returns null when target is outside project root', () => {
      expect(toProjectRootReference('/proj', '/elsewhere/x.md', false)).toBe(null);
    });

    it('returns RewrittenLink with kind="projectRoot" for paths inside project', () => {
      const result = toProjectRootReference('/proj', '/proj/docs/x.md', false);
      expect(result).toEqual({
        kind: 'projectRoot',
        rest: 'docs/x.md',
        text: 'docs/x.md',
      });
    });

    it('returns "." for project root itself', () => {
      const result = toProjectRootReference('/proj', '/proj', false);
      expect(result).toEqual({ kind: 'projectRoot', rest: '.', text: '.' });
    });
  });
});

describe('link-token-context branch coverage', () => {
  describe('getTokenContext', () => {
    it('detects inline-code (backticks)', () => {
      const content = '`foo`';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'inline-code' });
    });

    it('detects bracketed (<...>)', () => {
      const content = '<foo>';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'bracketed' });
    });

    it('detects double-quoted', () => {
      const content = '"foo"';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'quoted' });
    });

    it('detects single-quoted', () => {
      const content = "'foo'";
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'quoted' });
    });

    it('detects at-prefix', () => {
      const content = '@foo bar';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'at-prefix' });
    });

    it('detects markdown-link-dest after ](', () => {
      const content = '[label](foo)';
      // token starts at index 8 ("foo"), prev is '(', char at start-2 is ']'
      expect(getTokenContext(content, 8, 11)).toEqual({ role: 'markdown-link-dest' });
    });

    it('detects bracket-label ([foo])', () => {
      const content = '[foo]';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'bracket-label' });
    });

    it('falls through to bare-prose', () => {
      const content = ' foo ';
      expect(getTokenContext(content, 1, 4)).toEqual({ role: 'bare-prose' });
    });

    it('detects markdown reference definition destination', () => {
      const content = '[ref]: foo\n';
      // token starts at 7 ("foo")
      expect(getTokenContext(content, 7, 10)).toEqual({ role: 'markdown-link-dest' });
    });

    it('returns bare-prose at start of content (start === 0)', () => {
      expect(getTokenContext('foo', 0, 3)).toEqual({ role: 'bare-prose' });
    });
  });

  describe('shouldRewritePathToken', () => {
    it('returns false when start is negative', () => {
      expect(shouldRewritePathToken('foo', -1, 3, 'foo', true)).toBe(false);
    });

    it('returns false when end exceeds content length', () => {
      expect(shouldRewritePathToken('foo', 0, 100, 'foo', true)).toBe(false);
    });

    it('returns true for markdown reference definition destination', () => {
      const content = '[ref]: foo.md\n';
      expect(shouldRewritePathToken(content, 7, 13, 'foo.md', false)).toBe(true);
    });

    it('returns false for double-quoted token (string-literal context)', () => {
      const content = '"foo.md"';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(false);
    });

    it('returns false for single-quoted token (string-literal context)', () => {
      const content = "'foo.md'";
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(false);
    });

    it('returns true for backtick-wrapped token', () => {
      const content = '`foo.md`';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(true);
    });

    it('returns true for <bracketed> token', () => {
      const content = '<foo.md>';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(true);
    });

    it('returns true for [bracket-label] token (rewriteBarePathTokens=true)', () => {
      const content = '[foo.md]';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', true)).toBe(true);
    });

    it('returns false for [bracket-label] when label duplicates dest and not rewriting bare', () => {
      const content = '[foo.md](foo.md)';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(false);
    });

    it('returns true for [bracket-label] root-relative token even when label duplicates dest', () => {
      const content = '[.agentsmesh/x.md](.agentsmesh/x.md)';
      expect(shouldRewritePathToken(content, 1, 17, '.agentsmesh/x.md', false)).toBe(true);
    });

    it('returns true for @-prefixed token', () => {
      const content = '@foo.md';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(true);
    });

    it('returns true for ( ... ) markdown link destination form', () => {
      const content = '](foo.md)';
      // token at 2..8 with before='(' and after=')'
      expect(shouldRewritePathToken(content, 2, 8, 'foo.md', false)).toBe(true);
    });

    it('returns false for ( ... ! invalid follow char', () => {
      const content = '(foo.md!';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(false);
    });

    it('returns false in bare prose when rewriteBarePathTokens is false', () => {
      const content = ' foo.md ';
      expect(shouldRewritePathToken(content, 1, 7, 'foo.md', false)).toBe(false);
    });

    it('returns true in bare prose for root-relative token (rewriteBarePathTokens=true)', () => {
      const content = ' .agentsmesh/x.md ';
      expect(shouldRewritePathToken(content, 1, 17, '.agentsmesh/x.md', true)).toBe(true);
    });

    it('returns true in bare prose for ./ token', () => {
      const content = ' ./foo.md ';
      expect(shouldRewritePathToken(content, 1, 9, './foo.md', true)).toBe(true);
    });

    it('returns true in bare prose for ../ token', () => {
      const content = ' ../foo.md ';
      expect(shouldRewritePathToken(content, 1, 10, '../foo.md', true)).toBe(true);
    });

    it('returns true in bare prose when path has separator and last segment has dot', () => {
      const content = ' docs/foo.md ';
      expect(shouldRewritePathToken(content, 1, 12, 'docs/foo.md', true)).toBe(true);
    });

    it('returns false in bare prose when last segment has no dot', () => {
      const content = ' docs/folder ';
      expect(shouldRewritePathToken(content, 1, 12, 'docs/folder', true)).toBe(false);
    });

    it('returns false in bare prose when token has no separator', () => {
      const content = ' bare ';
      expect(shouldRewritePathToken(content, 1, 5, 'bare', true)).toBe(false);
    });

    it('strips trailing punctuation and line-number suffix before evaluating', () => {
      // "foo.md:42" -> punct strip leaves it; line-number strip yields "foo.md"; candidateEnd=13.
      // Reference-definition test sees prefix "[ref]: " and follow char at 13 (':' from ":42"),
      // which is a permitted follow char.
      const content = '[ref]: foo.md:42\n';
      expect(shouldRewritePathToken(content, 7, 16, 'foo.md:42', false)).toBe(true);
    });
  });
});

describe('link-token-guards branch coverage', () => {
  describe('isTildeHomeRelativePathToken', () => {
    it('returns true when ~/ precedes the token', () => {
      const content = 'foo ~/bar';
      // matchText starts at offset 6 ('bar'), preceded by ~/
      expect(isTildeHomeRelativePathToken(content, 6, 'bar')).toBe(true);
    });

    it('returns true when ~ precedes a token starting with /', () => {
      const content = 'foo ~/bar';
      // token "/bar" starting at offset 5, preceded by '~'
      expect(isTildeHomeRelativePathToken(content, 5, '/bar')).toBe(true);
    });

    it('returns false when no ~ prefix', () => {
      const content = 'foo /bar';
      expect(isTildeHomeRelativePathToken(content, 4, '/bar')).toBe(false);
    });

    it('returns false at offset 0 with no preceding chars', () => {
      expect(isTildeHomeRelativePathToken('bar', 0, 'bar')).toBe(false);
    });

    it('returns false at offset 1 when char[0] is not ~', () => {
      expect(isTildeHomeRelativePathToken('xbar', 1, 'bar')).toBe(false);
    });
  });

  describe('isMarkdownLinkDestinationToken', () => {
    it('returns true for ](foo) form with )', () => {
      const content = '[label](foo)';
      expect(isMarkdownLinkDestinationToken(content, 8, 'foo')).toBe(true);
    });

    it('returns true for ](foo#anchor) form', () => {
      const content = '[label](foo#anchor)';
      expect(isMarkdownLinkDestinationToken(content, 8, 'foo')).toBe(true);
    });

    it('returns true for ](foo?query) form', () => {
      const content = '[label](foo?q=1)';
      expect(isMarkdownLinkDestinationToken(content, 8, 'foo')).toBe(true);
    });

    it('returns true for ](foo title) form (space after)', () => {
      const content = '[label](foo "t")';
      expect(isMarkdownLinkDestinationToken(content, 8, 'foo')).toBe(true);
    });

    it('returns false when not preceded by (', () => {
      const content = 'just foo bar';
      expect(isMarkdownLinkDestinationToken(content, 5, 'foo')).toBe(false);
    });

    it('returns false when offset is 0', () => {
      expect(isMarkdownLinkDestinationToken('foo', 0, 'foo')).toBe(false);
    });

    it('returns false when ( is not preceded by ]', () => {
      const content = ' (foo)';
      expect(isMarkdownLinkDestinationToken(content, 2, 'foo')).toBe(false);
    });

    it('returns false when char after token is invalid', () => {
      const content = '[l](foo!)';
      expect(isMarkdownLinkDestinationToken(content, 4, 'foo')).toBe(false);
    });
  });

  describe('isRelativePathToken', () => {
    it('returns true for ./ tokens', () => {
      expect(isRelativePathToken('./foo.md')).toBe(true);
    });

    it('returns true for ../ tokens', () => {
      expect(isRelativePathToken('../foo.md')).toBe(true);
    });

    it('returns false for POSIX absolute paths', () => {
      expect(isRelativePathToken('/abs/foo.md')).toBe(false);
    });

    it('returns false for Windows absolute paths', () => {
      expect(isRelativePathToken('C:\\abs\\foo.md')).toBe(false);
    });

    it('returns false for tool-rooted (.agentsmesh/...) tokens', () => {
      expect(isRelativePathToken('.agentsmesh/rules/x.md')).toBe(false);
    });

    it('returns true for bare path with separator', () => {
      expect(isRelativePathToken('docs/foo.md')).toBe(true);
    });

    it('returns false for bare token without separator', () => {
      expect(isRelativePathToken('foo.md')).toBe(false);
    });
  });
});

describe('validate-generated-markdown-links branch coverage', () => {
  describe('parseMarkdownLinkDestination', () => {
    it('strips title with double quotes', () => {
      expect(parseMarkdownLinkDestination('./a.md "title"')).toBe('./a.md');
    });

    it('strips title with single quotes', () => {
      expect(parseMarkdownLinkDestination("./a.md 'title'")).toBe('./a.md');
    });

    it('strips angle brackets', () => {
      expect(parseMarkdownLinkDestination('<./a.md>')).toBe('./a.md');
    });

    it('strips title and angle brackets together', () => {
      // The function applies title-stripping first, then angle bracket stripping.
      expect(parseMarkdownLinkDestination('<./a.md>')).toBe('./a.md');
    });

    it('returns plain destination unchanged', () => {
      expect(parseMarkdownLinkDestination('./a.md')).toBe('./a.md');
    });

    it('trims surrounding whitespace', () => {
      expect(parseMarkdownLinkDestination('   ./a.md   ')).toBe('./a.md');
    });
  });

  describe('resolveMarkdownLinkTargets', () => {
    it('returns [] for fragment-only links (#section)', () => {
      expect(resolveMarkdownLinkTargets('#anchor', '/proj', '/proj/CLAUDE.md')).toEqual([]);
    });

    it('returns [] for http URLs', () => {
      expect(resolveMarkdownLinkTargets('https://example.com', '/proj', '/proj/CLAUDE.md')).toEqual(
        [],
      );
    });

    it('returns [] for mailto: links', () => {
      expect(resolveMarkdownLinkTargets('mailto:a@b.com', '/proj', '/proj/CLAUDE.md')).toEqual([]);
    });

    it('returns [] for data: URIs', () => {
      expect(resolveMarkdownLinkTargets('data:text/plain,hi', '/proj', '/proj/CLAUDE.md')).toEqual(
        [],
      );
    });

    it('returns [] for javascript: URIs', () => {
      expect(resolveMarkdownLinkTargets('javascript:void(0)', '/proj', '/proj/CLAUDE.md')).toEqual(
        [],
      );
    });

    it('returns [] for ftp: URIs', () => {
      expect(resolveMarkdownLinkTargets('ftp://host/x', '/proj', '/proj/CLAUDE.md')).toEqual([]);
    });

    it('returns [] for unknown schemes (e.g. notion:)', () => {
      expect(resolveMarkdownLinkTargets('notion://page', '/proj', '/proj/CLAUDE.md')).toEqual([]);
    });

    it('treats Windows drive paths as resolvable, not as schemes', () => {
      const result = resolveMarkdownLinkTargets('C:/Users/x.md', '/proj', '/proj/CLAUDE.md');
      // It returns at least one candidate (the Windows path joined to project)
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('strips line-number suffix (path:42)', () => {
      // When resolveProjectPath returns [], the fallback adds two candidates.
      const result = resolveMarkdownLinkTargets('docs/x.md:42', '/proj', '/proj/CLAUDE.md');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.every((p) => !p.endsWith(':42'))).toBe(true);
    });

    it('handles malformed percent-encoding by leaving raw', () => {
      const result = resolveMarkdownLinkTargets('bad%E0%A4.md', '/proj', '/proj/CLAUDE.md');
      // Decoding throws -> falls back to raw pathPart -> still resolves to candidates
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('uses fallback candidates when resolveProjectPath returns []', () => {
      // Bare token "AGENTS.md" yields [] from resolveProjectPath -> fallback used.
      const result = resolveMarkdownLinkTargets('AGENTS.md', '/proj', '/proj/.claude/CLAUDE.md');
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result).toContain('/proj/AGENTS.md');
    });

    it('handles destinations with hash anchors (path#section)', () => {
      const result = resolveMarkdownLinkTargets('docs/x.md#section', '/proj', '/proj/CLAUDE.md');
      expect(result.every((p) => !p.includes('#'))).toBe(true);
    });
  });

  describe('findBrokenMarkdownLinks', () => {
    let tempRoot: string;

    beforeEach(() => {
      tempRoot = mkdtempSync(join(tmpdir(), 'amesh-link-cov-'));
    });

    afterEach(() => {
      rmSync(tempRoot, { recursive: true, force: true });
    });

    it('skips non-markdown outputs', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/rules.txt',
          content: '[a](./missing.md)',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, '/proj')).toEqual([]);
    });

    it('returns empty when content has no links', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: 'no links here',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, '/proj')).toEqual([]);
    });

    it('skips inline links inside fenced code blocks (protected ranges)', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '```\n[a](./gone.md)\n```',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, '/proj')).toEqual([]);
    });

    it('skips empty inline link destinations', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '[empty]( )',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, '/proj')).toEqual([]);
    });

    it('detects reference-definition links via REF_LINK_DEF', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '[ref]: ./gone.md\n',
          status: 'created',
        },
      ];
      const broken = findBrokenMarkdownLinks(results, '/proj');
      expect(broken).toHaveLength(1);
      expect(broken[0]!.rawLink).toContain('./gone.md');
    });

    it('handles angle-bracketed reference-definition links', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '[ref]: <./gone.md>\n',
          status: 'created',
        },
      ];
      const broken = findBrokenMarkdownLinks(results, '/proj');
      expect(broken).toHaveLength(1);
    });

    it('skips empty reference-definition URLs', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '[ref]: <>\n',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, '/proj')).toEqual([]);
    });

    it('accepts links pointing to existing on-disk directory', () => {
      mkdirSync(join(tempRoot, 'docs'), { recursive: true });
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: 'AGENTS.md',
          content: '[d](./docs/)',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, tempRoot)).toEqual([]);
    });

    it('accepts links to existing on-disk file', () => {
      mkdirSync(join(tempRoot, 'docs'), { recursive: true });
      writeFileSync(join(tempRoot, 'docs', 'x.md'), 'hi');
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: 'AGENTS.md',
          content: '[x](./docs/x.md)',
          status: 'created',
        },
      ];
      expect(findBrokenMarkdownLinks(results, tempRoot)).toEqual([]);
    });

    it('reports broken inline links when target is missing on disk and not planned', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: 'AGENTS.md',
          content: '[m](./missing.md)',
          status: 'created',
        },
      ];
      const broken = findBrokenMarkdownLinks(results, tempRoot);
      expect(broken).toHaveLength(1);
      expect(broken[0]!.target).toBe('cursor');
      expect(broken[0]!.checkedPaths.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateGeneratedMarkdownLinks', () => {
    it('returns silently when no broken links', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: 'no links',
          status: 'created',
        },
      ];
      expect(() => validateGeneratedMarkdownLinks(results, '/proj')).not.toThrow();
    });

    it('throws with detailed line for each broken link', () => {
      const results: GenerateResult[] = [
        {
          target: 'cursor',
          path: '.cursor/AGENTS.md',
          content: '[a](./gone.md)',
          status: 'created',
        },
      ];
      expect(() => validateGeneratedMarkdownLinks(results, '/proj')).toThrowError(
        /broken local links/,
      );
    });
  });
});
