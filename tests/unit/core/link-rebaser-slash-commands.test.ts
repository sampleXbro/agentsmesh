/**
 * A slash command is not a path.
 *
 * Agent-facing docs are full of `/plugin`, `/config`, `/memory`, `/compact`.
 * The rewriter treated a single-segment root-absolute token as a repo-root
 * path, and because resolution is existence-gated, the corruption only appeared
 * once a directory of that name existed: a repo with a `plugin/` directory saw
 * `/plugin` silently rewritten to `plugin` in every generated skill. Directory
 * names like `config`, `docs`, `test` and `build` are common enough that this
 * was waiting to happen in most projects.
 *
 * The rule: `/word` with no extension and no trailing slash is a command. Say
 * `/word/`, `word/` or `/dir/file.md` when a path is meant.
 */

import { describe, it, expect } from 'vitest';
import { rewriteFileLinks } from '../../../src/core/reference/link-rebaser.js';

function rewrite(content: string, existing: readonly string[], dirs: readonly string[] = []) {
  return rewriteFileLinks({
    content,
    projectRoot: '/proj',
    sourceFile: '/proj/.agentsmesh/skills/demo/SKILL.md',
    destinationFile: '/proj/.claude/skills/demo/SKILL.md',
    translatePath: (absolutePath) => absolutePath,
    pathExists: (absolutePath) => existing.includes(absolutePath),
    pathIsDirectory: (absolutePath) => dirs.includes(absolutePath),
    rewriteBarePathTokens: true,
  });
}

describe('slash commands are left alone', () => {
  it('keeps /plugin even when a plugin directory exists', () => {
    const out = rewrite(
      'Open `/plugin`, then run `/reload-plugins`.',
      ['/proj/plugin', '/proj/plugin/'],
      ['/proj/plugin'],
    );
    expect(out.content).toContain('`/plugin`');
    expect(out.content).toContain('`/reload-plugins`');
  });

  it.each(['/config', '/memory', '/compact', '/clear', '/test', '/build', '/docs'])(
    'keeps %s even when a directory of that name exists',
    (command) => {
      const dir = `/proj${command}`;
      const out = rewrite(`Run \`${command}\` to continue.`, [dir, `${dir}/`], [dir]);
      expect(out.content).toContain(`\`${command}\``);
    },
  );

  it('still rewrites a root-absolute path with a trailing slash', () => {
    const out = rewrite('See `/test/` for fixtures.', ['/proj/test', '/proj/test/'], ['/proj/test']);
    expect(out.content).not.toContain('`/test/`');
  });

  it('still rewrites a root-absolute path with more than one segment', () => {
    const out = rewrite('See `/src/app.ts` here.', ['/proj/src/app.ts'], []);
    expect(out.content).not.toContain('`/src/app.ts`');
  });

  it('still rewrites a root-absolute file with an extension', () => {
    const out = rewrite('See `/AGENTS.md` here.', ['/proj/AGENTS.md'], []);
    expect(out.content).not.toContain('`/AGENTS.md`');
  });

  it('leaves a command alone when no such directory exists either', () => {
    const out = rewrite('Run `/plugin` now.', [], []);
    expect(out.content).toContain('`/plugin`');
  });
});
