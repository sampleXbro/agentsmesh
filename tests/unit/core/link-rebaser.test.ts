import { describe, expect, it } from 'vitest';
import { rewriteFileLinks } from '../../../src/core/reference/link-rebaser.js';

describe('rewriteFileLinks', () => {
  it('rewrites ordinary project links and translated artifact links to project-root paths', () => {
    const rewritten = rewriteFileLinks({
      content: [
        'Docs: `../../docs/some-doc.md`.',
        'Command: `.agentsmesh/commands/review.md`.',
        'Markdown: [some doc](../../docs/some-doc.md)',
      ].join('\n'),
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh/commands/review.md'
          ? '/proj/.claude/commands/review.md'
          : absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/docs/some-doc.md' ||
        absolutePath === '/proj/.claude/commands/review.md',
    });

    expect(rewritten.content).toContain('Docs: `docs/some-doc.md`.');
    // Canonical `.agentsmesh/commands/review.md` reference projects to the
    // colocated `.claude/commands/review.md` target counterpart.
    expect(rewritten.content).toContain('Command: `.claude/commands/review.md`.');
    expect(rewritten.content).toContain('[some doc](docs/some-doc.md)');
    expect(rewritten.missing).toEqual([]);
  });

  it('preserves missing links and reports them for validation', () => {
    const rewritten = rewriteFileLinks({
      content: 'Missing: `../../docs/missing.md`.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: () => false,
    });

    expect(rewritten.content).toBe('Missing: `../../docs/missing.md`.');
    expect(rewritten.missing).toEqual(['/proj/docs/missing.md']);
  });

  it('rewrites over-traversal relative links by falling back to the project root when the in-repo target exists', () => {
    const rewritten = rewriteFileLinks({
      content: 'Check also `../../../../docs/agents-folder-structure-research.md`.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/skills/typescript-pro/SKILL.md',
      destinationFile: '/proj/.claude/skills/typescript-pro/SKILL.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/docs/agents-folder-structure-research.md',
    });

    expect(rewritten.content).toBe('Check also `docs/agents-folder-structure-research.md`.');
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites inline-code file references while keeping fenced code blocks untouched', () => {
    const rewritten = rewriteFileLinks({
      content: ['Inline: `../../docs/some-doc.md`.', '```', '../../docs/some-doc.md', '```'].join(
        '\n',
      ),
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/docs/some-doc.md',
    });

    expect(rewritten.content).toContain('Inline: `docs/some-doc.md`.');
    expect(rewritten.content).toContain('```\n../../docs/some-doc.md\n```');
    expect(rewritten.missing).toEqual([]);
  });

  it('syncs markdown bracket text to the rewritten URL when label and URL name the same file differently', () => {
    const rewritten = rewriteFileLinks({
      content: 'Markdown: [./rules/typescript.md](.agentsmesh/rules/typescript.md)',
      projectRoot: '/proj',
      sourceFile: '/proj/.claude/CLAUDE.md',
      destinationFile: '/proj/.agentsmesh/rules/_root.md',
      translatePath: (absolutePath) =>
        absolutePath === '/proj/.claude/rules/typescript.md'
          ? '/proj/.agentsmesh/rules/typescript.md'
          : absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/.claude/rules/typescript.md' ||
        absolutePath === '/proj/.agentsmesh/rules/typescript.md',
      explicitCurrentDirLinks: true,
    });

    expect(rewritten.content).toBe('Markdown: [.agentsmesh/rules/typescript.md](./typescript.md)');
    expect(rewritten.missing).toEqual([]);
  });

  it('uses relative destinations for markdown links to folders', () => {
    const rewritten = rewriteFileLinks({
      content: 'Use [references](.agentsmesh/skills/ts-library/references/).',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/.claude/skills/ts-library/SKILL.md',
      translatePath: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh/skills/ts-library/references'
          ? '/proj/.claude/skills/ts-library/references'
          : absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/.claude/skills/ts-library/references',
      explicitCurrentDirLinks: true,
      rewriteBarePathTokens: true,
    });

    expect(rewritten.content).toBe('Use [references](./references/).');
    expect(rewritten.missing).toEqual([]);
  });

  it('keeps prose docs tokens as repo-root absolute style without a leading slash', () => {
    const rewritten = rewriteFileLinks({
      content: 'Policy: `../../../../docs/architecture/review.md` is canonical.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/skills/prepare-release/SKILL.md',
      destinationFile: '/proj/.windsurf/skills/prepare-release/SKILL.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/docs/architecture/review.md',
    });

    expect(rewritten.content).toBe('Policy: `docs/architecture/review.md` is canonical.');
    expect(rewritten.content).not.toContain('/docs/architecture/review.md');
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites markdown destinations to destination-relative paths when possible', () => {
    const rewritten = rewriteFileLinks({
      content: 'Read [review](../../../../docs/architecture/review.md).',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/skills/prepare-release/SKILL.md',
      destinationFile: '/proj/docs/link-rebaser-requirements.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/docs/architecture/review.md',
      explicitCurrentDirLinks: true,
    });

    expect(rewritten.content).toBe('Read [review](./architecture/review.md).');
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites target-native links back to canonical relative paths on import', () => {
    const rewritten = rewriteFileLinks({
      content: 'Use `.claude/commands/review.md` and `docs/some-doc.md`.',
      projectRoot: '/proj',
      sourceFile: '/proj/CLAUDE.md',
      destinationFile: '/proj/.agentsmesh/rules/_root.md',
      translatePath: (absolutePath) =>
        absolutePath === '/proj/.claude/commands/review.md'
          ? '/proj/.agentsmesh/commands/review.md'
          : absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh/commands/review.md' ||
        absolutePath === '/proj/docs/some-doc.md',
    });

    expect(rewritten.content).toContain('`.agentsmesh/commands/review.md`');
    expect(rewritten.content).toContain('docs/some-doc.md');
    expect(rewritten.missing).toEqual([]);
  });

  it('does not rewrite bare root artifact filenames in prose', () => {
    const rewritten = rewriteFileLinks({
      content: '# Windsurf via AGENTS.md and CLAUDE.md.',
      projectRoot: '/proj',
      sourceFile: '/proj/AGENTS.md',
      destinationFile: '/proj/.agentsmesh/rules/_root.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/AGENTS.md' || absolutePath === '/proj/CLAUDE.md',
    });

    expect(rewritten.content).toBe('# Windsurf via AGENTS.md and CLAUDE.md.');
    expect(rewritten.missing).toEqual([]);
  });

  it('does not rewrite glob patterns that contain path-like fragments', () => {
    const rewritten = rewriteFileLinks({
      content: 'globs: ["src/**/*.ts", "tests/**/*.ts"]',
      projectRoot: '/proj',
      sourceFile: '/proj/.github/copilot/ts.instructions.md',
      destinationFile: '/proj/.agentsmesh/rules/ts.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: () => false,
    });

    expect(rewritten.content).toBe('globs: ["src/**/*.ts", "tests/**/*.ts"]');
    expect(rewritten.missing).toEqual([]);
  });

  it('ignores status markers like ✓ / ✗ instead of treating the slash as a path', () => {
    const translated: string[] = [];
    const checked: string[] = [];
    const rewritten = rewriteFileLinks({
      content: 'Legend: ✓ / ✗',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => {
        translated.push(absolutePath);
        return absolutePath;
      },
      pathExists: (absolutePath) => {
        checked.push(absolutePath);
        return false;
      },
    });

    expect(rewritten.content).toBe('Legend: ✓ / ✗');
    expect(rewritten.missing).toEqual([]);
    expect(translated).toEqual([]);
    expect(checked).toEqual([]);
  });

  it('leaves bare prose directory names alone while rewriting canonical file paths to colocated targets', () => {
    const rewritten = rewriteFileLinks({
      content:
        'Prose dirs (no rewrite): scripts/ docs/ references/. Canonical: .agentsmesh/commands/review.md.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh/commands/review.md'
          ? '/proj/.claude/commands/review.md'
          : absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/.claude/commands/review.md',
      explicitCurrentDirLinks: true,
      rewriteBarePathTokens: true,
    });

    expect(rewritten.content).toBe(
      'Prose dirs (no rewrite): scripts/ docs/ references/. Canonical: .claude/commands/review.md.',
    );
    expect(rewritten.missing).toEqual([]);
  });

  it('preserves .agentsmesh/ anchor and rewrites /dir/ to project-root-relative', () => {
    // .agentsmesh  (no trailing slash) — bare name, stays unchanged
    // .agentsmesh/ (with slash)        — well-known anchor, preserved as-is (not collapsed to ./)
    // /test/                           — a path (trailing slash), rewritten to project-root-relative `test`
    //                                    Bare `/test` is a slash command and is left alone; see
    //                                    link-rebaser-slash-commands.test.ts
    const rewritten = rewriteFileLinks({
      content: 'Mention `.agentsmesh` and `test`, but keep `.agentsmesh/` and `/test/` as links.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh' ||
        absolutePath === '/proj/test' ||
        absolutePath === '/proj/.agentsmesh/' ||
        absolutePath === '/proj/test/',
      pathIsDirectory: (absolutePath) =>
        absolutePath === '/proj/.agentsmesh' || absolutePath === '/proj/test',
      rewriteBarePathTokens: true,
    });

    expect(rewritten.content).toContain('`.agentsmesh`'); // bare name unchanged
    expect(rewritten.content).toContain('`test`'); // bare name unchanged
    expect(rewritten.content).toContain('`.agentsmesh/`'); // anchor preserved (was incorrectly ./  before)
    expect(rewritten.content).not.toContain('`/test/`'); // absolute /test/ → project-root-relative test
  });

  it('rewrites absolute in-project paths to project-root-relative target paths', () => {
    const rewritten = rewriteFileLinks({
      content:
        'Absolute: `/proj/.agentsmesh/rules/typescript.md`, `/proj/.agentsmesh/commands/review.md`, `/proj/.agentsmesh/skills/api-generator/references/route-checklist.md`.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => {
        if (absolutePath === '/proj/.agentsmesh/rules/typescript.md') {
          return '/proj/.claude/rules/typescript.md';
        }
        if (absolutePath === '/proj/.agentsmesh/commands/review.md') {
          return '/proj/.claude/commands/review.md';
        }
        if (
          absolutePath === '/proj/.agentsmesh/skills/api-generator/references/route-checklist.md'
        ) {
          return '/proj/.claude/skills/api-generator/references/route-checklist.md';
        }
        return absolutePath;
      },
      pathExists: (absolutePath) =>
        absolutePath === '/proj/.claude/rules/typescript.md' ||
        absolutePath === '/proj/.claude/commands/review.md' ||
        absolutePath === '/proj/.claude/skills/api-generator/references/route-checklist.md',
    });

    expect(rewritten.content).toBe(
      'Absolute: `.claude/rules/typescript.md`, `.claude/commands/review.md`, `.claude/skills/api-generator/references/route-checklist.md`.',
    );
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites Windows drive-letter absolute paths when the project root is Windows-style', () => {
    const rewritten = rewriteFileLinks({
      content:
        'Windows absolute: `C:\\proj\\.agentsmesh\\rules\\typescript.md`, `C:/proj/.agentsmesh/commands/review.md`, `C:\\proj\\.agentsmesh\\skills\\api-generator\\references\\route-checklist.md`.',
      projectRoot: 'C:\\proj',
      sourceFile: 'C:\\proj\\.agentsmesh\\rules\\_root.md',
      destinationFile: 'C:\\proj\\CLAUDE.md',
      translatePath: (absolutePath) => {
        if (absolutePath === 'C:\\proj\\.agentsmesh\\rules\\typescript.md') {
          return 'C:\\proj\\.claude\\rules\\typescript.md';
        }
        if (absolutePath === 'C:\\proj\\.agentsmesh\\commands\\review.md') {
          return 'C:\\proj\\.claude\\commands\\review.md';
        }
        if (
          absolutePath ===
          'C:\\proj\\.agentsmesh\\skills\\api-generator\\references\\route-checklist.md'
        ) {
          return 'C:\\proj\\.claude\\skills\\api-generator\\references\\route-checklist.md';
        }
        return absolutePath;
      },
      pathExists: (absolutePath) =>
        absolutePath === 'C:\\proj\\.claude\\rules\\typescript.md' ||
        absolutePath === 'C:\\proj\\.claude\\commands\\review.md' ||
        absolutePath === 'C:\\proj\\.claude\\skills\\api-generator\\references\\route-checklist.md',
    });

    expect(rewritten.content).toBe(
      'Windows absolute: `C:\\proj\\.agentsmesh\\rules\\typescript.md`, `C:/proj/.agentsmesh/commands/review.md`, `C:\\proj\\.agentsmesh\\skills\\api-generator\\references\\route-checklist.md`.',
    );
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites backslash-relative and mixed-separator paths to forward-slash project-root paths', () => {
    const rewritten = rewriteFileLinks({
      content: [
        'Backslash relative: `..\\commands\\review.md`, `..\\agents\\code-reviewer.md`.',
        'Mixed: `..\\skills/api-generator\\SKILL.md`, `..\\..\\docs/some-doc.md`.',
        'Canonical mixed: `.agentsmesh\\skills/api-generator\\references\\route-checklist.md`.',
      ].join('\n'),
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/typescript.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => {
        if (absolutePath === '/proj/.agentsmesh/commands/review.md') {
          return '/proj/.claude/commands/review.md';
        }
        if (absolutePath === '/proj/.agentsmesh/agents/code-reviewer.md') {
          return '/proj/.claude/agents/code-reviewer.md';
        }
        if (absolutePath === '/proj/.agentsmesh/skills/api-generator/SKILL.md') {
          return '/proj/.claude/skills/api-generator/SKILL.md';
        }
        if (
          absolutePath === '/proj/.agentsmesh/skills/api-generator/references/route-checklist.md'
        ) {
          return '/proj/.claude/skills/api-generator/references/route-checklist.md';
        }
        return absolutePath;
      },
      pathExists: (absolutePath) =>
        absolutePath === '/proj/.claude/commands/review.md' ||
        absolutePath === '/proj/.claude/agents/code-reviewer.md' ||
        absolutePath === '/proj/.claude/skills/api-generator/SKILL.md' ||
        absolutePath === '/proj/.claude/skills/api-generator/references/route-checklist.md' ||
        absolutePath === '/proj/docs/some-doc.md',
    });

    expect(rewritten.content).toContain(
      'Backslash relative: `.claude/commands/review.md`, `.claude/agents/code-reviewer.md`.',
    );
    expect(rewritten.content).toContain(
      'Mixed: `.claude/skills/api-generator/SKILL.md`, `docs/some-doc.md`.',
    );
    // Canonical `.agentsmesh/...` reference projects to the colocated target counterpart.
    expect(rewritten.content).toContain(
      'Canonical mixed: `.claude/skills/api-generator/references/route-checklist.md`.',
    );
    expect(rewritten.missing).toEqual([]);
  });

  it('strips line-number suffixes and rewrites the base path', () => {
    const rewritten = rewriteFileLinks({
      content: [
        'See `src/handler.ts:42` for the entry point.',
        'Also check `../../utils/parse.ts:10:5` for column info.',
        'Ref: `../../docs/guide.md:99`.',
      ].join('\n'),
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/src/handler.ts' ||
        absolutePath === '/proj/utils/parse.ts' ||
        absolutePath === '/proj/docs/guide.md',
    });

    expect(rewritten.content).toContain('See `src/handler.ts:42` for the entry point.');
    expect(rewritten.content).toContain('Also check `utils/parse.ts:10:5` for column info.');
    expect(rewritten.content).toContain('Ref: `docs/guide.md:99`.');
    expect(rewritten.missing).toEqual([]);
  });

  it('does not rewrite paths inside fenced code blocks', () => {
    const content = [
      'Before: `../../src/config.ts` is important.',
      '```bash',
      'cd ../../src/config.ts',
      'cat ../../docs/guide.md',
      '```',
      'After: `../../src/config.ts` should rewrite.',
    ].join('\n');

    const rewritten = rewriteFileLinks({
      content,
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) =>
        absolutePath === '/proj/src/config.ts' || absolutePath === '/proj/docs/guide.md',
    });

    expect(rewritten.content).toContain('Before: `src/config.ts` is important.');
    expect(rewritten.content).toContain('cd ../../src/config.ts');
    expect(rewritten.content).toContain('cat ../../docs/guide.md');
    expect(rewritten.content).toContain('After: `src/config.ts` should rewrite.');
    expect(rewritten.missing).toEqual([]);
  });

  it('rewrites paths inside inline code spans', () => {
    const rewritten = rewriteFileLinks({
      content: 'Run `../../src/config.ts` to check, but `../../src/config.ts` is the real ref.',
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => absolutePath,
      pathExists: (absolutePath) => absolutePath === '/proj/src/config.ts',
    });

    expect(rewritten.content).toBe(
      'Run `src/config.ts` to check, but `src/config.ts` is the real ref.',
    );
    expect(rewritten.missing).toEqual([]);
  });

  it('ignores protocol-relative URLs instead of treating them as paths', () => {
    const translated: string[] = [];
    const checked: string[] = [];
    const content = ['CDN: //cdn.example.com/lib.js', 'API: //api.example.com/v1/data'].join('\n');

    const rewritten = rewriteFileLinks({
      content,
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => {
        translated.push(absolutePath);
        return absolutePath;
      },
      pathExists: (absolutePath) => {
        checked.push(absolutePath);
        return false;
      },
    });

    expect(rewritten.content).toBe(content);
    expect(rewritten.missing).toEqual([]);
    expect(translated).toEqual([]);
    expect(checked).toEqual([]);
  });

  describe('suffix-strip resolution for tool-specific root-relative paths', () => {
    it('rewrites tool-prefixed root-relative path by checking if suffix exists in destination tree', () => {
      // A skill SKILL.md contains .codex/skills/figma/references/file.md (original tool path).
      // The file will exist in the generated destination tree at references/figma-tools.md
      // relative to the destination SKILL.md — no artifact map needed.
      const rewritten = rewriteFileLinks({
        content: 'See also `.codex/skills/figma/references/figma-tools.md` for usage.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/packs/my-pack/skills/figma/SKILL.md',
        destinationFile: '/proj/.claude/skills/figma/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.claude/skills/figma/references/figma-tools.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('See also `./references/figma-tools.md` for usage.');
      expect(rewritten.missing).toEqual([]);
    });

    it('rewrites link with different tool prefix (.claude/) when target exists in destination tree', () => {
      const rewritten = rewriteFileLinks({
        content: 'Reference: `.claude/skills/ts-pro/references/ts-checklist.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/packs/ts-pack/skills/ts-pro/SKILL.md',
        destinationFile: '/proj/.cursor/skills/ts-pro/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.cursor/skills/ts-pro/references/ts-checklist.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('Reference: `./references/ts-checklist.md`.');
      expect(rewritten.missing).toEqual([]);
    });

    it('works for manually-added canonical skills — not only installed packs', () => {
      // Same logic applies when SKILL.md lives in .agentsmesh/skills/ (not a pack).
      const rewritten = rewriteFileLinks({
        content: 'See `.agents/skills/figma/references/figma-tools.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/skills/figma/SKILL.md',
        destinationFile: '/proj/.claude/skills/figma/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.claude/skills/figma/references/figma-tools.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('See `./references/figma-tools.md`.');
      expect(rewritten.missing).toEqual([]);
    });

    it('does not strip to bare filename — requires ≥2 suffix segments', () => {
      // .codex/file.md has only 2 segments; stripping leaves a bare filename.
      // The fallback helper returns null immediately in this case.
      const rewritten = rewriteFileLinks({
        content: 'Short: `.codex/file.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/packs/my-pack/skills/figma/SKILL.md',
        destinationFile: '/proj/.claude/skills/figma/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        // Even if file.md happens to exist in the dest dir, it must NOT be matched.
        pathExists: (absolutePath) => absolutePath === '/proj/.claude/skills/figma/file.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('Short: `.codex/file.md`.');
    });

    it('leaves link unchanged when suffix is not found anywhere in the destination tree', () => {
      const rewritten = rewriteFileLinks({
        content: 'Missing: `.codex/skills/figma/references/nonexistent.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/packs/my-pack/skills/figma/SKILL.md',
        destinationFile: '/proj/.claude/skills/figma/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: () => false,
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('Missing: `.codex/skills/figma/references/nonexistent.md`.');
    });

    it('main loop handles primary path before suffix-strip fallback is reached', () => {
      // The primary root-relative path exists on disk → main loop resolves it.
      // The suffix-strip fallback is not triggered.
      const rewritten = rewriteFileLinks({
        content: 'Link: `.codex/skills/figma/references/file.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/packs/my-pack/skills/figma/SKILL.md',
        destinationFile: '/proj/.codex/skills/figma/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.codex/skills/figma/references/file.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe('Link: `./references/file.md`.');
      expect(rewritten.missing).toEqual([]);
    });

    it('prefers destination-tree suffix-strip over cross-tree existingFallback when another target artifact has same path', () => {
      // Real scenario: canonical SKILL.md contains .agents/skills/ts-library/references/project-setup.md
      // .agents/ artifact EXISTS on disk (generated for codex-cli), but the gemini destination tree
      // ALSO has the file at references/project-setup.md — dest-tree wins.
      const rewritten = rewriteFileLinks({
        content:
          '| Setup | [.agents/skills/ts-library/references/project-setup.md](.agents/skills/ts-library/references/project-setup.md) |',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/skills/ts-library/SKILL.md',
        destinationFile: '/proj/.gemini/skills/ts-library/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        pathExists: (absolutePath) =>
          // .agents/ path exists on disk (another target's artifact)
          absolutePath === '/proj/.agents/skills/ts-library/references/project-setup.md' ||
          // destination tree also has the file — this must win
          absolutePath === '/proj/.gemini/skills/ts-library/references/project-setup.md',
        explicitCurrentDirLinks: true,
      });

      expect(rewritten.content).toBe(
        '| Setup | [./references/project-setup.md](./references/project-setup.md) |',
      );
      expect(rewritten.missing).toEqual([]);
    });

    it('rewrites markdown link text from canonical anchor to destination-relative while keeping destination relative', () => {
      const rewritten = rewriteFileLinks({
        content:
          '- [ ] [.agentsmesh/skills/ts-library/references/ci-workflows.md](./references/ci-workflows.md) - if CI',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/skills/ts-library/SKILL.md',
        destinationFile: '/proj/.github/skills/ts-library/SKILL.md',
        translatePath: (absolutePath) =>
          absolutePath === '/proj/.agentsmesh/skills/ts-library/references/ci-workflows.md'
            ? '/proj/.github/skills/ts-library/references/ci-workflows.md'
            : absolutePath,
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.github/skills/ts-library/references/ci-workflows.md',
        explicitCurrentDirLinks: true,
      });
      expect(rewritten.content).toBe(
        '- [ ] [./references/ci-workflows.md](./references/ci-workflows.md) - if CI',
      );
    });

    it('falls back to existingFallback when suffix-strip finds nothing in destination tree', () => {
      // If the dest tree does NOT have the file, the original existingFallback still fires.
      const rewritten = rewriteFileLinks({
        content: 'See `.agents/skills/ts-library/references/project-setup.md`.',
        projectRoot: '/proj',
        sourceFile: '/proj/.agentsmesh/skills/ts-library/SKILL.md',
        destinationFile: '/proj/.gemini/skills/ts-library/SKILL.md',
        translatePath: (absolutePath) => absolutePath,
        // Only the .agents/ artifact exists — dest tree does NOT have the file.
        pathExists: (absolutePath) =>
          absolutePath === '/proj/.agents/skills/ts-library/references/project-setup.md',
        explicitCurrentDirLinks: true,
      });

      // Project scope: outside `.agentsmesh/` → project-root-relative to the .agents/ artifact
      expect(rewritten.content).toBe(
        'See `.agents/skills/ts-library/references/project-setup.md`.',
      );
      expect(rewritten.missing).toEqual([]);
    });

    describe('global mode (projectRoot = homedir)', () => {
      it('rewrites target-native prose paths to the current generated global target surface', () => {
        const rewritten = rewriteFileLinks({
          content: 'Read `.codex/skills/figma/references/figma-tools-and-prompts.md`.',
          projectRoot: '/home/user',
          sourceFile: '/home/user/.agentsmesh/skills/figma/SKILL.md',
          destinationFile: '/home/user/.claude/skills/figma/SKILL.md',
          translatePath: (absolutePath) => absolutePath,
          pathExists: (absolutePath) =>
            absolutePath ===
            '/home/user/.claude/skills/figma/references/figma-tools-and-prompts.md',
          explicitCurrentDirLinks: true,
          scope: 'global',
        });

        expect(rewritten.content).toBe('Read `./references/figma-tools-and-prompts.md`.');
        expect(rewritten.missing).toEqual([]);
      });

      it('rewrites target-native paths when they resolve in the destination tree', () => {
        const rewritten = rewriteFileLinks({
          content: 'See `.agents/skills/ts-library/references/project-setup.md`.',
          projectRoot: '/home/user',
          sourceFile: '/home/user/.agentsmesh/skills/ts-library/SKILL.md',
          destinationFile: '/home/user/.gemini/skills/ts-library/SKILL.md',
          translatePath: (absolutePath) => absolutePath,
          pathExists: (absolutePath) =>
            absolutePath === '/home/user/.gemini/skills/ts-library/references/project-setup.md',
          explicitCurrentDirLinks: true,
          scope: 'global',
        });

        expect(rewritten.content).toBe('See `./references/project-setup.md`.');
        expect(rewritten.missing).toEqual([]);
      });

      it('prefers the current destination tree when multiple global target candidates exist', () => {
        const rewritten = rewriteFileLinks({
          content: 'See `.agents/skills/ts-library/references/project-setup.md`.',
          projectRoot: '/home/user',
          sourceFile: '/home/user/.agentsmesh/skills/ts-library/SKILL.md',
          destinationFile: '/home/user/.gemini/skills/ts-library/SKILL.md',
          translatePath: (absolutePath) => absolutePath,
          pathExists: (absolutePath) =>
            absolutePath === '/home/user/.agents/skills/ts-library/references/project-setup.md' ||
            absolutePath === '/home/user/.gemini/skills/ts-library/references/project-setup.md',
          explicitCurrentDirLinks: true,
          scope: 'global',
        });

        expect(rewritten.content).toBe('See `./references/project-setup.md`.');
        expect(rewritten.missing).toEqual([]);
      });

      it('normalizes relative prose links to project-root standard links in global scope', () => {
        const rewritten = rewriteFileLinks({
          content: 'Project code stays standard: `../../src/cli/index.ts`.',
          projectRoot: '/home/user',
          sourceFile: '/home/user/.agentsmesh/skills/figma/SKILL.md',
          destinationFile: '/home/user/.claude/skills/figma/SKILL.md',
          translatePath: (absolutePath) => absolutePath,
          pathExists: (absolutePath) => absolutePath === '/home/user/src/cli/index.ts',
          explicitCurrentDirLinks: true,
          scope: 'global',
        });

        expect(rewritten.content).toBe('Project code stays standard: `src/cli/index.ts`.');
        expect(rewritten.missing).toEqual([]);
      });

      it('leaves link unchanged in global mode when suffix not found in destination tree', () => {
        const rewritten = rewriteFileLinks({
          content: 'Missing: `.agents/skills/ts-library/references/nonexistent.md`.',
          projectRoot: '/home/user',
          sourceFile: '/home/user/.agentsmesh/skills/ts-library/SKILL.md',
          destinationFile: '/home/user/.gemini/skills/ts-library/SKILL.md',
          translatePath: (absolutePath) => absolutePath,
          pathExists: () => false,
          explicitCurrentDirLinks: true,
          scope: 'global',
        });

        expect(rewritten.content).toBe(
          'Missing: `.agents/skills/ts-library/references/nonexistent.md`.',
        );
      });
    });
  });

  it('ignores external URI-like and SCP-style refs that are not project file paths', () => {
    const translated: string[] = [];
    const checked: string[] = [];
    const content = [
      'Git SCP: git@github.com:owner/repo.git',
      'SSH URI: ssh://git@github.com/owner/repo.git',
      'Mail: mailto:test@example.com',
      'FTP: ftp://example.com/file',
      'VSCode: vscode://file/path',
      'Package: npm:@scope/pkg',
      'Docker: docker://ghcr.io/org/img',
    ].join('\n');

    const rewritten = rewriteFileLinks({
      content,
      projectRoot: '/proj',
      sourceFile: '/proj/.agentsmesh/rules/_root.md',
      destinationFile: '/proj/CLAUDE.md',
      translatePath: (absolutePath) => {
        translated.push(absolutePath);
        return absolutePath;
      },
      pathExists: (absolutePath) => {
        checked.push(absolutePath);
        return false;
      },
    });

    expect(rewritten.content).toBe(content);
    expect(rewritten.missing).toEqual([]);
    expect(translated).toEqual([]);
    expect(checked).toEqual([]);
  });
});
