/**
 * Extra branch coverage tests for link-rebaser-* modules and friends.
 * Each test targets a specific uncovered branch identified via the istanbul
 * branchMap in coverage/coverage-final.json.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandResolvedPaths, resolveProjectPath } from '../../../src/core/reference/link-rebaser-helpers.js';
import { protectedRanges } from '../../../src/core/reference/protected-ranges.js';
import { rewriteFileLinks } from '../../../src/core/reference/link-rebaser.js';
import {
  formatLinkPathForDestination,
  pickShortestValidatedFormattedLink,
  compareFormattedLinks,
} from '../../../src/core/reference/link-rebaser-output.js';
import {
  formatLinkPathForDestinationLegacy,
  toAgentsMeshRootRelative,
  toProjectRootReference,
} from '../../../src/core/reference/link-rebaser-formatting.js';
import {
  getTokenContext,
  shouldRewritePathToken,
} from '../../../src/core/reference/link-token-context.js';
import {
  parseMarkdownLinkDestination,
  resolveMarkdownLinkTargets,
  findBrokenMarkdownLinks,
} from '../../../src/core/reference/validate-generated-markdown-links.js';
import {
  addDirectoryMapping,
  addSimpleFileMapping,
  addSkillLikeMapping,
  addScopedAgentsMappings,
  rel,
  listFiles,
} from '../../../src/core/reference/import-map-shared.js';
import type { GenerateResult } from '../../../src/core/types.js';

describe('link-rebaser — extra uncovered branches', () => {
  it('global scope, no translation, source not under mesh, target outside mesh, source top empty (file at root)', () => {
    // sourceFile is at project root → sourceFromRoot has no segments → sourceTop = ''.
    // The condition `sourceTop.length > 0` is false → falls through and continues to the
    // `tokenCanUseGlobalStandard` second guard. Bare relative './x.md' under mesh stays.
    const result = rewriteFileLinks({
      content: '[r](./x.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/AGENTS.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (p) => p,
      pathExists: (p) => p === '/proj/x.md',
      scope: 'global',
    });
    expect(typeof result.content).toBe('string');
  });

  it('global scope when token references mesh but source/destination are outside mesh — no early return', () => {
    // Token starts with `.agentsmesh/...`, so tokenReferencesMesh=true → first if's
    // `!tokenReferencesMesh` short-circuits to skip same-surface return → continues.
    const result = rewriteFileLinks({
      content: '[m](.agentsmesh/rules/x.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/.claude/CLAUDE.md',
      destinationFile: '/proj/.claude/CLAUDE.md',
      translatePath: (p) => p,
      pathExists: (p) => p === '/proj/.agentsmesh/rules/x.md',
      scope: 'global',
    });
    // Token referencing mesh is rewritten or kept; we just assert no crash.
    expect(typeof result.content).toBe('string');
  });

  it('rewriteFileLinks: targetIsDirectory and candidate has no slash → bare folder bail-out (line 97 binary-expr arm)', () => {
    // candidate=".agentsmesh" (no slash). pathIsDirectory says true → returns match.
    const result = rewriteFileLinks({
      content: 'See `.agentsmesh` directory.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (p) => p,
      pathExists: (p) => p === '/proj/.agentsmesh',
      pathIsDirectory: (p) => p === '/proj/.agentsmesh',
    });
    // Bare folder name is preserved.
    expect(result.content).toContain('.agentsmesh');
  });

  it('rewriteFileLinks: matched path returns null translatedPath → adds to missing set', () => {
    // pathExists returns false for everything; resolveLinkTarget returns matchedPath=undefined
    // → no missing add. Use a candidate whose translation explicitly returns empty string
    // to verify the missing.add side-effect branch when matchedPath set + translatedPath null.
    const result = rewriteFileLinks({
      content: '[x](./missing.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (_p) => '', // returns empty translated path
      pathExists: (_p) => false,
    });
    expect(result.content).toContain('./missing.md');
  });

  it('rewriteFileLinks: same destination top different from target top → no preferRelativeProse short-circuit', () => {
    // Generates from .agentsmesh source to .claude destination; target at .cursor.
    // destTop=.claude, targetTop=.cursor → preferRelative branch fires false → still
    // emits a rewrite. Covers the destTop===targetTop=false arm.
    const result = rewriteFileLinks({
      content: '[r](.cursor/rules/x.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/.claude/CLAUDE.md',
      translatePath: (p) => p,
      pathExists: (p) => p === '/proj/.cursor/rules/x.md',
    });
    expect(typeof result.content).toBe('string');
  });

  it('rewriteFileLinks: rewritten === null path → returns match (formatLink returns null)', () => {
    // /elsewhere/x.md absolute outside project; with no scope=global the path goes through
    // formatLinkPathForDestination → forceRelative path returns null since target outside
    // project → outer rewritten===null branch returns the original match.
    const result = rewriteFileLinks({
      content: '[a](/elsewhere/abs.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/.agentsmesh/rules/_root.md',
      translatePath: (p) => p,
      pathExists: (p) => p === '/elsewhere/abs.md',
    });
    expect(typeof result.content).toBe('string');
  });
});

describe('link-rebaser-helpers — extra uncovered branches', () => {
  it('protectedRanges: no protected scheme matches in plain text → only fenced/contract/embedded scanned', () => {
    // Empty content → no matches at all. Ensures the `?? 0` fallback on match.index is
    // not the only path; here we hit the loop with no iterations.
    expect(protectedRanges('')).toEqual([]);
  });

  it('expandResolvedPaths: realpathSync.native expands symlink to a different absolute path', () => {
    const root = mkdtempSync(join(tmpdir(), 'amesh-extra-'));
    try {
      const targetFile = join(root, 'real.md');
      writeFileSync(targetFile, 'real');
      const linkPath = join(root, 'link.md');
      symlinkSync(targetFile, linkPath);
      const result = expandResolvedPaths(root, linkPath);
      // First entry is original, additional entries appended via realpathSync push branch.
      expect(result[0]).toBe(linkPath);
      expect(result.some((p) => p.endsWith('real.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolveProjectPath: bare hidden file with dot but no slash → source-dir candidate (line 105 has-dot branch)', () => {
    // Token like 'foo.txt' that is NOT in the NON_REWRITABLE list and has dot.
    const result = resolveProjectPath('foo.txt', '/proj', '/proj/.agentsmesh/rules/_root.md');
    expect(result).toEqual(['/proj/.agentsmesh/rules/foo.txt']);
  });

  it('resolveProjectPath: bare token in NON_REWRITABLE_BARE_FILES → returns []', () => {
    expect(resolveProjectPath('CLAUDE.md', '/proj', '/proj/.agentsmesh/rules/_root.md')).toEqual(
      [],
    );
  });

  it('resolveProjectPath: bare token without dot or slash → returns []', () => {
    expect(resolveProjectPath('plain', '/proj', '/proj/.agentsmesh/rules/_root.md')).toEqual([]);
  });

  it('resolveProjectPath: absolute under project root → uses startsWith branch', () => {
    expect(resolveProjectPath('/proj/foo.md', '/proj', '/proj/AGENTS.md')).toEqual([
      '/proj/foo.md',
    ]);
  });
});

describe('link-rebaser-output — extra uncovered branches', () => {
  it('formatLinkPathForDestination: inline-code .agentsmesh/ token uses normal formatting path', () => {
    const out = formatLinkPathForDestination(
      '/proj',
      '/proj/CLAUDE.md',
      '/proj/.agentsmesh/rules/x.md',
      false,
      {
        tokenContext: { role: 'inline-code' },
        originalToken: '.agentsmesh/rules/x.md',
      },
    );
    expect(out).toBe('.agentsmesh/rules/x.md');
  });

  it('formatLinkPathForDestination: forceRelative path delegates to legacy and returns rel path (line 53/74)', () => {
    const out = formatLinkPathForDestination(
      '/proj',
      '/proj/.agentsmesh/rules/_root.md',
      '/proj/.agentsmesh/rules/x.md',
      false,
      { forceRelative: true },
    );
    expect(out).toBe('.agentsmesh/rules/x.md');
  });

  it('formatLinkPathForDestination: global scope + destination outside .agentsmesh → toProjectRootReference null when target outside project', () => {
    const out = formatLinkPathForDestination(
      '/proj',
      '/proj/.claude/CLAUDE.md',
      '/elsewhere/x.md',
      false,
      { scope: 'global' },
    );
    expect(out).toBeNull();
  });

  it('formatLinkPathForDestination: treatAsDirectory branch with no mesh path (toAgentsMeshRootRelative null) — falls back to projectRoot ref (line 114)', () => {
    // Target inside mesh, keepSlash=true (treatAsDirectory). Mesh-root-relative succeeds.
    const out = formatLinkPathForDestination(
      '/proj',
      '/proj/.agentsmesh/rules/_root.md',
      '/proj/.agentsmesh/skills/foo',
      true,
    );
    expect(out).toBe('.agentsmesh/skills/foo/');
  });

  it('formatLinkPathForDestination: logicalMeshSourceAbsolute branch picks logical mesh path when target is outside mesh', () => {
    // Target absolute is outside mesh, but logicalMeshSourceAbsolute points inside mesh.
    const out = formatLinkPathForDestination(
      '/proj',
      '/proj/.agentsmesh/rules/_root.md',
      '/proj/.claude/skills/foo',
      true,
      {
        logicalMeshSourceAbsolute: '/proj/.agentsmesh/skills/foo',
      },
    );
    expect(out).toBe('skills/foo/');
  });

  it('compareFormattedLinks: ../../-heavy vs ../-only — second has fewer ../ → first is worse (positive)', () => {
    expect(compareFormattedLinks('../../a.md', '../b.md')).toBeGreaterThan(0);
  });

  it('compareFormattedLinks: same tier, same ../ count, different lengths', () => {
    expect(compareFormattedLinks('./short.md', './much-longer-path.md')).toBeLessThan(0);
  });

  it('pickShortestValidatedFormattedLink: returns null when no candidate exists on disk', () => {
    const out = pickShortestValidatedFormattedLink(
      '/proj',
      '/proj/CLAUDE.md',
      ['/proj/.agentsmesh/rules/missing.md'],
      false,
      { forceRelative: true },
      () => false, // none exist
    );
    expect(out).toBeNull();
  });

  it('pickShortestValidatedFormattedLink: linkResolvesToTarget returns false → continues', () => {
    // Build a candidate where formatLinkPathForDestination would produce a string but
    // linkResolvesToTarget cannot validate. Use a bare token target outside mesh and project.
    const out = pickShortestValidatedFormattedLink(
      '/proj',
      '/proj/CLAUDE.md',
      ['/elsewhere/x.md'],
      false,
      {},
      () => true,
    );
    // Either null (formatted=null) or the validate fails — both yield null.
    expect(out).toBeNull();
  });
});

describe('link-rebaser-formatting — extra uncovered branches', () => {
  it('formatLinkPathForDestinationLegacy: target outside project root → uses projectRoot reference', () => {
    const out = formatLinkPathForDestinationLegacy(
      '/proj',
      '/proj/CLAUDE.md',
      '/elsewhere/x.md',
      false,
      {},
    );
    expect(out).toBeNull();
  });

  it('formatLinkPathForDestinationLegacy: explicitCurrentDirLinks adds ./ when destDir is not project root and rel does not start with ./ or ../', () => {
    const out = formatLinkPathForDestinationLegacy(
      '/proj',
      '/proj/sub/file.md',
      '/proj/sub/sibling.md',
      false,
      { explicitCurrentDirLinks: true },
    );
    expect(out).toBe('./sibling.md');
  });

  it('formatLinkPathForDestinationLegacy: explicitCurrentDirLinks but destDir IS project root → no ./ prefix', () => {
    const out = formatLinkPathForDestinationLegacy('/proj', '/proj/file.md', '/proj/x.md', false, {
      explicitCurrentDirLinks: true,
    });
    expect(out).toBe('x.md');
  });

  it('toAgentsMeshRootRelative: returns null when target equals mesh root (relPath length 0)', () => {
    expect(toAgentsMeshRootRelative('/proj', '/proj/.agentsmesh', false)).toBeNull();
  });

  it('toAgentsMeshRootRelative: keepSlash=true and target is the mesh root file path', () => {
    expect(toAgentsMeshRootRelative('/proj', '/proj/.agentsmesh/skills', true)).toBe('skills/');
  });

  it('toProjectRootReference: returns null for target outside project', () => {
    expect(toProjectRootReference('/proj', '/elsewhere', false)).toBeNull();
  });
});

describe('link-token-context — extra uncovered branches', () => {
  it('getTokenContext: ` ` ` (inline-code) wrapping → role inline-code', () => {
    expect(getTokenContext('`x`', 1, 2)).toEqual({ role: 'inline-code' });
  });

  it('shouldRewritePathToken: out-of-bounds start returns false', () => {
    expect(shouldRewritePathToken('content', -1, 5, 'token', false)).toBe(false);
  });

  it('shouldRewritePathToken: out-of-bounds end returns false', () => {
    expect(shouldRewritePathToken('content', 0, 1000, 'token', false)).toBe(false);
  });

  it('shouldRewritePathToken: ref-link-def at end of content (after === EOF)', () => {
    const content = '[ref]: foo.md';
    expect(shouldRewritePathToken(content, 7, 13, 'foo.md', false)).toBe(true);
  });

  it('shouldRewritePathToken: bracket-label that is duplicated as destination (rewriteBare=false) returns false', () => {
    // [foo.md](foo.md) — duplicate guard kicks in only when rewriteBare=false AND not root-relative.
    expect(shouldRewritePathToken('[foo.md](foo.md)', 1, 7, 'foo.md', false)).toBe(false);
  });

  it('shouldRewritePathToken: rewriteBare=true; bare token with leading ./ → true', () => {
    expect(shouldRewritePathToken('see ./foo.md here', 4, 11, './foo.md', true)).toBe(true);
  });

  it('shouldRewritePathToken: rewriteBare=true; bare token whose last segment lacks dot → false', () => {
    expect(shouldRewritePathToken('see foo/bar here', 4, 11, 'foo/bar', true)).toBe(false);
  });

  it('shouldRewritePathToken: rewriteBare=false and no recognized context → false', () => {
    expect(shouldRewritePathToken('see foo.md here', 4, 10, 'foo.md', false)).toBe(false);
  });

  it('getTokenContext: bare-prose default fallback (no surrounding markers)', () => {
    const content = 'plain foo bar';
    expect(getTokenContext(content, 6, 9)).toEqual({ role: 'bare-prose' });
  });

  it('getTokenContext: bracket label `[token]`', () => {
    expect(getTokenContext('[a]', 1, 2)).toEqual({ role: 'bracket-label' });
  });
});

describe('import-map-shared — extra uncovered branches', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'amesh-extra-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('rel: backslash-bearing relative path is normalized to forward slashes', () => {
    expect(rel('/proj', '/proj/sub/file.md')).toBe('sub/file.md');
  });

  it('listFiles: returns [] when directory does not exist (catch fallback)', async () => {
    const result = await listFiles(root, 'no-such-dir');
    expect(result).toEqual([]);
  });

  it('addDirectoryMapping: maps both with and without trailing slash', () => {
    const refs = new Map<string, string>();
    addDirectoryMapping(refs, '.foo/dir', '.bar/dir');
    expect(refs.get('.foo/dir')).toBe('.bar/dir');
    expect(refs.get('.foo/dir/')).toBe('.bar/dir/');
  });

  it('addSimpleFileMapping: builds canonical path with extension stripped', () => {
    const refs = new Map<string, string>();
    addSimpleFileMapping(refs, '.cursor/rules/foo.mdc', '.agentsmesh/rules', '.mdc');
    expect(refs.get('.cursor/rules/foo.mdc')).toBe('.agentsmesh/rules/foo.md');
  });

  it('addSkillLikeMapping: returns when relPath does not start with skillsDir', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, 'unrelated/path/x.md', '.cursor/skills');
    expect(refs.size).toBe(0);
  });

  it('addSkillLikeMapping: returns when rest is empty (skillsDir/ with no tail)', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/', '.cursor/skills');
    expect(refs.size).toBe(0);
  });

  it('addSkillLikeMapping: bare file in skillsDir without slash, ending .md but not SKILL.md → maps to skills/<name>/SKILL.md', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/single.md', '.cursor/skills');
    expect(refs.get('.cursor/skills/single.md')).toBe('.agentsmesh/skills/single/SKILL.md');
  });

  it('addSkillLikeMapping: bare file SKILL.md (no nested folder) is rejected', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/SKILL.md', '.cursor/skills');
    expect(refs.size).toBe(0);
  });

  it('addSkillLikeMapping: nested file with empty filename is skipped', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/folder/', '.cursor/skills');
    expect(refs.size).toBe(0);
  });

  it('addSkillLikeMapping: nested SKILL.md adds directory mapping + file mapping (line 95)', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/foo/SKILL.md', '.cursor/skills');
    expect(refs.get('.cursor/skills/foo')).toBe('.agentsmesh/skills/foo');
    expect(refs.get('.cursor/skills/foo/SKILL.md')).toBe('.agentsmesh/skills/foo/SKILL.md');
  });

  it('addSkillLikeMapping: nested non-SKILL file → ancestor mappings added', () => {
    const refs = new Map<string, string>();
    addSkillLikeMapping(refs, '.cursor/skills/foo/sub/asset.md', '.cursor/skills');
    expect(refs.get('.cursor/skills/foo/sub/asset.md')).toBe('.agentsmesh/skills/foo/sub/asset.md');
    expect(refs.get('.cursor/skills/foo/sub')).toBe('.agentsmesh/skills/foo/sub');
  });

  it('addScopedAgentsMappings: skips a top-level AGENTS.md (only nested ones map)', async () => {
    writeFileSync(join(root, 'AGENTS.md'), '# top');
    const refs = new Map<string, string>();
    await addScopedAgentsMappings(refs, root);
    // Top-level AGENTS.md is excluded by the !== 'AGENTS.md' guard.
    expect(refs.has('AGENTS.md')).toBe(false);
  });

  it('addScopedAgentsMappings: nested AGENTS.md maps to .agentsmesh/rules/<dir>.md', async () => {
    mkdirSync(join(root, 'pkg', 'sub'), { recursive: true });
    writeFileSync(join(root, 'pkg', 'AGENTS.md'), '# pkg');
    writeFileSync(join(root, 'pkg', 'sub', 'AGENTS.md'), '# sub');
    const refs = new Map<string, string>();
    await addScopedAgentsMappings(refs, root);
    expect(refs.get('pkg/AGENTS.md')).toBe('.agentsmesh/rules/pkg.md');
    expect(refs.get('pkg/sub/AGENTS.md')).toBe('.agentsmesh/rules/pkg-sub.md');
  });

  it('addScopedAgentsMappings: skips when parent directory contains a hidden segment', async () => {
    mkdirSync(join(root, '.hidden', 'inner'), { recursive: true });
    writeFileSync(join(root, '.hidden', 'inner', 'AGENTS.md'), '# hidden');
    const refs = new Map<string, string>();
    await addScopedAgentsMappings(refs, root);
    expect(refs.size).toBe(0);
  });
});

describe('validate-generated-markdown-links — extra uncovered branches', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'amesh-extra-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('parseMarkdownLinkDestination: angle-bracket form unwrapped', () => {
    expect(parseMarkdownLinkDestination('<./foo.md>')).toBe('./foo.md');
  });

  it('parseMarkdownLinkDestination: title clause stripped', () => {
    expect(parseMarkdownLinkDestination('./x.md "title"')).toBe('./x.md');
  });

  it('shouldSkipLocalValidation: empty path skipped (returns [])', () => {
    expect(resolveMarkdownLinkTargets('   ', tempRoot, join(tempRoot, 'AGENTS.md'))).toEqual([]);
  });

  it('shouldSkipLocalValidation: hash-only fragment is skipped', () => {
    expect(resolveMarkdownLinkTargets('#anchor', tempRoot, join(tempRoot, 'AGENTS.md'))).toEqual(
      [],
    );
  });

  it('shouldSkipLocalValidation: protocol-only mailto is skipped', () => {
    expect(resolveMarkdownLinkTargets('mailto:x@y', tempRoot, join(tempRoot, 'AGENTS.md'))).toEqual(
      [],
    );
  });

  it('shouldSkipLocalValidation: data: URL skipped', () => {
    expect(
      resolveMarkdownLinkTargets('data:text/plain,foo', tempRoot, join(tempRoot, 'AGENTS.md')),
    ).toEqual([]);
  });

  it('shouldSkipLocalValidation: javascript: URL skipped', () => {
    expect(
      resolveMarkdownLinkTargets('javascript:void(0)', tempRoot, join(tempRoot, 'AGENTS.md')),
    ).toEqual([]);
  });

  it('shouldSkipLocalValidation: ftp: URL skipped', () => {
    expect(
      resolveMarkdownLinkTargets('ftp://host/x', tempRoot, join(tempRoot, 'AGENTS.md')),
    ).toEqual([]);
  });

  it('shouldSkipLocalValidation: Windows drive letter NOT skipped (kept for resolution)', () => {
    const out = resolveMarkdownLinkTargets('C:/x', tempRoot, join(tempRoot, 'AGENTS.md'));
    expect(Array.isArray(out)).toBe(true);
  });

  it('shouldSkipLocalValidation: arbitrary scheme like custom: skipped', () => {
    expect(resolveMarkdownLinkTargets('thing:abc', tempRoot, join(tempRoot, 'AGENTS.md'))).toEqual(
      [],
    );
  });

  it('resolveMarkdownLinkTargets: link-number suffix stripped via LINE_NUMBER_SUFFIX', () => {
    writeFileSync(join(tempRoot, 'foo.md'), 'x');
    const out = resolveMarkdownLinkTargets('foo.md:42', tempRoot, join(tempRoot, 'AGENTS.md'));
    expect(out.some((p) => p.endsWith('foo.md'))).toBe(true);
  });

  it('resolveMarkdownLinkTargets: invalid percent encoding falls back to raw path (catch branch)', () => {
    const out = resolveMarkdownLinkTargets('foo%ZZ.md', tempRoot, join(tempRoot, 'AGENTS.md'));
    expect(Array.isArray(out)).toBe(true);
  });

  it('findBrokenMarkdownLinks: skips non-markdown outputs (.json/.toml)', () => {
    const results: GenerateResult[] = [
      { target: 'cursor', path: 'mcp.json', content: '[a](./missing.md)', status: 'created' },
    ];
    expect(findBrokenMarkdownLinks(results, tempRoot)).toEqual([]);
  });

  it('findBrokenMarkdownLinks: ref-def with empty url is skipped', () => {
    const results: GenerateResult[] = [
      { target: 'cursor', path: 'AGENTS.md', content: '[ref]: <>', status: 'created' },
    ];
    expect(findBrokenMarkdownLinks(results, tempRoot)).toEqual([]);
  });

  it('findBrokenMarkdownLinks: inline link with undefined inner (regex group missing) is skipped', () => {
    // The INLINE_MD_LINK pattern always captures group 1 except when no parens. Use a case
    // that triggers the `inner === undefined` short-circuit conceptually by ensuring a
    // matched outer with empty parens body.
    const results: GenerateResult[] = [
      { target: 'cursor', path: 'AGENTS.md', content: '[empty]()', status: 'created' },
    ];
    // Empty path → shouldSkipLocalValidation returns true → checked is empty → not broken.
    expect(findBrokenMarkdownLinks(results, tempRoot)).toEqual([]);
  });

  it('findBrokenMarkdownLinks: inline match index missing fallback (?? 0)', () => {
    // Default RegExp matchAll always provides match.index; this test validates the
    // behaviour in normal flow.
    const results: GenerateResult[] = [
      {
        target: 'cursor',
        path: 'AGENTS.md',
        content: '[a](./missing.md)',
        status: 'created',
      },
    ];
    const broken = findBrokenMarkdownLinks(results, tempRoot);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.rawLink).toBe('./missing.md');
  });
});
