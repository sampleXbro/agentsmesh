/**
 * Sequential `agentsmesh import --from <target>` behavior across targets.
 *
 * Overlapping canonical paths are last-import-wins; disjoint paths accumulate.
 * Two exceptions, both because the canonical slot holds more than one source:
 * MCP servers merge by name across sequential imports (imported wins on
 * conflict), and `rules/_root.md` accumulates every target's root rule —
 * two tools' root instructions are distinct content, not one entity described
 * twice, so replacing there would destroy the user's rules.
 *
 * Global scope (`import --global`): `resolveScopeContext` uses `homedir()` for both `rootBase`
 * and canonical output (`~/.agentsmesh`), regardless of cwd. Project scope writes under `<cwd>/.agentsmesh`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const TEST_DIR = join(tmpdir(), 'am-integration-import-multi');
const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function runImport(from: string): void {
  execSync(`node ${CLI_PATH} import --from ${from}`, { cwd: TEST_DIR });
}

function runImportProject(from: string, cwd: string): void {
  execSync(`node ${CLI_PATH} import --from ${from}`, {
    cwd,
    env: { ...process.env },
  });
}

function runImportGlobal(from: string, cwd: string, homeDir: string): void {
  execSync(`node ${CLI_PATH} import --global --from ${from}`, {
    cwd,
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
  });
}

describe('import: multi-target sequential merge (integration)', () => {
  it('accumulates disjoint canonical paths: claude-only files survive a later cursor import', () => {
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.claude', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'CLAUDE.md'),
      '# Claude root\n\nMarker CLAUDE_ROOT_BODY',
    );
    writeFileSync(
      join(TEST_DIR, '.claude', 'rules', 'typescript.md'),
      '---\ndescription: TS\n---\n\nCLAUDE_TYPESCRIPT_ONLY',
    );
    writeFileSync(
      join(TEST_DIR, '.claude', 'commands', 'review.md'),
      '---\ndescription: Review\n---\n\nCLAUDE_REVIEW_CMD',
    );

    runImport('claude-code');

    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Cursor root\n\nMarker CURSOR_ROOT_ONLY');

    runImport('cursor');

    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'), 'utf-8'),
    ).toContain('CLAUDE_TYPESCRIPT_ONLY');
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'), 'utf-8')).toContain(
      'CLAUDE_REVIEW_CMD',
    );
    const root = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('CURSOR_ROOT_ONLY');
    expect(root).toContain('CLAUDE_ROOT_BODY');
  });

  it('shared rules/_root.md accumulates both targets, in either order', () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), '# A\n\nROOT_MARKER_CLAUDE');
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# B\n\nROOT_MARKER_CURSOR');

    runImport('claude-code');
    runImport('cursor');
    const forward = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(forward).toContain('ROOT_MARKER_CURSOR');
    expect(forward).toContain('ROOT_MARKER_CLAUDE');

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    const reverse = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(reverse).toContain('ROOT_MARKER_CLAUDE');
    expect(reverse).toContain('ROOT_MARKER_CURSOR');
  });

  it('last import wins when two targets define the same NON-root rule name', () => {
    // Guards the root-rule exception: only `_root.md` accumulates. A named rule
    // colliding on the same canonical path is still one entity, last import wins.
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'rules', 'typescript.md'),
      '---\ndescription: TS\n---\n\nRULE_BODY_FROM_CLAUDE',
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'rules', 'typescript.mdc'),
      '---\ndescription: TS\nalwaysApply: false\n---\n\nRULE_BODY_FROM_CURSOR',
    );

    runImport('claude-code');
    runImport('cursor');
    const rule = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'), 'utf-8');
    expect(rule).toContain('RULE_BODY_FROM_CURSOR');
    expect(rule).not.toContain('RULE_BODY_FROM_CLAUDE');
  });

  it('root-rule merge keeps frontmatter the second source cannot express', () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'CLAUDE.md'),
      '---\ndescription: Kept description\n---\n\nROOT_FM_CLAUDE',
    );
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# B\n\nROOT_FM_CURSOR');

    runImport('claude-code');
    runImport('cursor');

    const root = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('root: true');
    expect(root).toContain('Kept description');
    expect(root).toContain('ROOT_FM_CLAUDE');
    expect(root).toContain('ROOT_FM_CURSOR');
  });

  it('last import wins when both targets define the same command name', () => {
    mkdirSync(join(TEST_DIR, '.claude', 'commands'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'commands', 'ship.md'),
      '---\ndescription: S\n---\n\nCMD_FROM_CLAUDE',
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'commands', 'ship.md'),
      '---\ndescription: S\n---\n\nCMD_FROM_CURSOR',
    );

    runImport('claude-code');
    runImport('cursor');
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'), 'utf-8')).toContain(
      'CMD_FROM_CURSOR',
    );

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    expect(readFileSync(join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'), 'utf-8')).toContain(
      'CMD_FROM_CLAUDE',
    );
  });

  it('sequential imports merge MCP servers by name (imported wins on conflict)', () => {
    writeFileSync(
      join(TEST_DIR, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          fromClaude: { type: 'stdio', command: 'claude-mcp', args: [], env: {} },
        },
      }),
    );
    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          fromCursor: { type: 'stdio', command: 'cursor-mcp', args: [], env: {} },
        },
      }),
    );

    runImport('claude-code');
    runImport('cursor');
    const after = JSON.parse(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(after.mcpServers).sort()).toEqual([
      'agentsmesh',
      'fromClaude',
      'fromCursor',
    ]);

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    const after2 = JSON.parse(readFileSync(join(TEST_DIR, '.agentsmesh', 'mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(after2.mcpServers).sort()).toEqual([
      'agentsmesh',
      'fromClaude',
      'fromCursor',
    ]);
  });

  it('last import wins for .agentsmesh/ignore when both targets contribute ignore patterns', () => {
    writeFileSync(join(TEST_DIR, '.claudeignore'), 'from-claude-ignore\n');
    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cursorignore'), 'from-cursor-ignore\n');

    runImport('claude-code');
    runImport('cursor');
    const ign = readFileSync(join(TEST_DIR, '.agentsmesh', 'ignore'), 'utf-8');
    expect(ign).toContain('from-cursor-ignore');
    expect(ign).not.toContain('from-claude-ignore');

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    const ign2 = readFileSync(join(TEST_DIR, '.agentsmesh', 'ignore'), 'utf-8');
    expect(ign2).toContain('from-claude-ignore');
    expect(ign2).not.toContain('from-cursor-ignore');
  });

  it('same skill name from two targets: last import overwrites canonical skills/<name>/SKILL.md', () => {
    mkdirSync(join(TEST_DIR, '.claude', 'skills', 'shared-skill'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor', 'skills', 'shared-skill'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'skills', 'shared-skill', 'SKILL.md'),
      '---\ndescription: X\n---\n\nSKILL_BODY_CLAUDE',
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'skills', 'shared-skill', 'SKILL.md'),
      '---\ndescription: X\n---\n\nSKILL_BODY_CURSOR',
    );

    runImport('claude-code');
    runImport('cursor');
    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'skills', 'shared-skill', 'SKILL.md'), 'utf-8'),
    ).toContain('SKILL_BODY_CURSOR');

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    expect(
      readFileSync(join(TEST_DIR, '.agentsmesh', 'skills', 'shared-skill', 'SKILL.md'), 'utf-8'),
    ).toContain('SKILL_BODY_CLAUDE');
  });

  it('last import wins for .agentsmesh/permissions.yaml from native settings.json', () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Read'], deny: ['PERM_FROM_CLAUDE'] },
      }),
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'cli.json'),
      JSON.stringify({
        permissions: { allow: ['Write'], deny: ['PERM_FROM_CURSOR'] },
      }),
    );

    runImport('claude-code');
    runImport('cursor');
    const perms = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(perms).toContain('PERM_FROM_CURSOR');
    expect(perms).not.toContain('PERM_FROM_CLAUDE');

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    const perms2 = readFileSync(join(TEST_DIR, '.agentsmesh', 'permissions.yaml'), 'utf-8');
    expect(perms2).toContain('PERM_FROM_CLAUDE');
    expect(perms2).not.toContain('PERM_FROM_CURSOR');
  });

  it('last import wins for .agentsmesh/hooks.yaml (standalone hooks.json per target)', () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'hooks.json'),
      JSON.stringify({
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'hooks_from_claude' }],
          },
        ],
      }),
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          postToolUse: [{ matcher: 'Edit', type: 'command', command: 'hooks_from_cursor' }],
        },
      }),
    );

    runImport('claude-code');
    runImport('cursor');
    const hooks = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(hooks).toContain('hooks_from_cursor');
    expect(hooks).not.toContain('hooks_from_claude');

    rmSync(join(TEST_DIR, '.agentsmesh'), { recursive: true, force: true });

    runImport('cursor');
    runImport('claude-code');
    const hooks2 = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(hooks2).toContain('hooks_from_claude');
    expect(hooks2).not.toContain('hooks_from_cursor');
  });

  it('re-importing the same target is idempotent for a fixed native tree', () => {
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), '# Root\n\nSTABLE');
    writeFileSync(
      join(TEST_DIR, '.claude', 'rules', 'extra.md'),
      '---\ndescription: E\n---\n\nExtra rule',
    );

    runImport('claude-code');
    const first = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');

    runImport('claude-code');
    const second = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'), 'utf-8');

    expect(second).toBe(first);
    expect(existsSync(join(TEST_DIR, '.agentsmesh', 'rules', 'extra.md'))).toBe(true);
  });
});

describe('import: project vs global canonical isolation (integration)', () => {
  it('project import fills <cwd>/.agentsmesh; global import fills $HOME/.agentsmesh only', () => {
    const fakeHome = join(TEST_DIR, 'fake-home');
    const projectDir = join(TEST_DIR, 'my-repo');
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(join(projectDir, '.claude'), { recursive: true });

    writeFileSync(join(projectDir, '.claude', 'CLAUDE.md'), '# P\n\nMARKER_PROJECT_ROOT');
    writeFileSync(join(fakeHome, '.claude', 'CLAUDE.md'), '# G\n\nMARKER_GLOBAL_ROOT');

    runImportProject('claude-code', projectDir);
    runImportGlobal('claude-code', projectDir, fakeHome);

    expect(readFileSync(join(projectDir, '.agentsmesh', 'rules', '_root.md'), 'utf-8')).toContain(
      'MARKER_PROJECT_ROOT',
    );
    expect(readFileSync(join(fakeHome, '.agentsmesh', 'rules', '_root.md'), 'utf-8')).toContain(
      'MARKER_GLOBAL_ROOT',
    );
    expect(existsSync(join(projectDir, '.agentsmesh', 'rules', '_root.md'))).toBe(true);
    expect(existsSync(join(fakeHome, '.agentsmesh', 'rules', '_root.md'))).toBe(true);
  });
});

describe('import: global sequential merge (integration)', () => {
  it('accumulates named rules from claude then cursor without overwriting prior _root when cursor has no new root source', () => {
    const fakeHome = join(TEST_DIR, 'global-home');
    const cwd = join(TEST_DIR, 'global-cwd');
    mkdirSync(join(fakeHome, '.claude', 'rules'), { recursive: true });
    mkdirSync(join(fakeHome, '.cursor', 'rules'), { recursive: true });
    mkdirSync(cwd, { recursive: true });

    writeFileSync(join(fakeHome, '.claude', 'CLAUDE.md'), '# Root\n\nROOT_FROM_CLAUDE_GLOBAL');
    writeFileSync(
      join(fakeHome, '.claude', 'rules', 'only_claude_global.md'),
      '---\ndescription: OC\n---\n\nCLAUDE_NAMED_RULE',
    );
    writeFileSync(
      join(fakeHome, '.cursor', 'rules', 'only_cursor_global.mdc'),
      '---\ndescription: OX\nalwaysApply: false\n---\n\nCURSOR_NAMED_RULE',
    );

    runImportGlobal('claude-code', cwd, fakeHome);
    runImportGlobal('cursor', cwd, fakeHome);

    const root = readFileSync(join(fakeHome, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('ROOT_FROM_CLAUDE_GLOBAL');
    expect(
      readFileSync(join(fakeHome, '.agentsmesh', 'rules', 'only_claude_global.md'), 'utf-8'),
    ).toContain('CLAUDE_NAMED_RULE');
    expect(
      readFileSync(join(fakeHome, '.agentsmesh', 'rules', 'only_cursor_global.md'), 'utf-8'),
    ).toContain('CURSOR_NAMED_RULE');
  });

  it('global cursor import accumulates onto _root when ~/.cursor/AGENTS.md is present', () => {
    const fakeHome = join(TEST_DIR, 'global-home-root-overwrite');
    const cwd = join(TEST_DIR, 'global-cwd-2');
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(join(fakeHome, '.cursor'), { recursive: true });
    mkdirSync(cwd, { recursive: true });

    writeFileSync(join(fakeHome, '.claude', 'CLAUDE.md'), '# A\n\nROOT_FROM_CLAUDE_GLOBAL');
    writeFileSync(join(fakeHome, '.cursor', 'AGENTS.md'), '# B\n\nROOT_FROM_CURSOR_GLOBAL');

    runImportGlobal('claude-code', cwd, fakeHome);
    runImportGlobal('cursor', cwd, fakeHome);

    const root = readFileSync(join(fakeHome, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('ROOT_FROM_CURSOR_GLOBAL');
    expect(root).toContain('ROOT_FROM_CLAUDE_GLOBAL');
  });
});

describe('import: three targets in one project (integration)', () => {
  it('merges disjoint rule files from claude-code, cursor, and gemini-cli (every root accumulates)', () => {
    const projectDir = join(TEST_DIR, 'triple');
    mkdirSync(join(projectDir, '.claude', 'rules'), { recursive: true });
    mkdirSync(join(projectDir, '.cursor', 'rules'), { recursive: true });
    mkdirSync(join(projectDir, '.gemini', 'rules'), { recursive: true });

    writeFileSync(join(projectDir, '.claude', 'CLAUDE.md'), '# C\n\nROOT_CLAUDE_TRIPLE');
    writeFileSync(
      join(projectDir, '.claude', 'rules', 'from_claude.md'),
      '---\ndescription: FC\n---\n\nRULE_CLAUDE_ONLY',
    );
    writeFileSync(
      join(projectDir, '.cursor', 'rules', 'from_cursor.mdc'),
      '---\ndescription: FCu\nalwaysApply: false\n---\n\nRULE_CURSOR_ONLY',
    );
    writeFileSync(join(projectDir, 'GEMINI.md'), '# G\n\nROOT_GEMINI_TRIPLE');
    writeFileSync(
      join(projectDir, '.gemini', 'rules', 'from_gemini.md'),
      '---\ndescription: FG\n---\n\nRULE_GEMINI_ONLY',
    );

    runImportProject('claude-code', projectDir);
    runImportProject('cursor', projectDir);
    runImportProject('gemini-cli', projectDir);

    expect(
      readFileSync(join(projectDir, '.agentsmesh', 'rules', 'from_claude.md'), 'utf-8'),
    ).toContain('RULE_CLAUDE_ONLY');
    expect(
      readFileSync(join(projectDir, '.agentsmesh', 'rules', 'from_cursor.md'), 'utf-8'),
    ).toContain('RULE_CURSOR_ONLY');
    expect(
      readFileSync(join(projectDir, '.agentsmesh', 'rules', 'from_gemini.md'), 'utf-8'),
    ).toContain('RULE_GEMINI_ONLY');

    const root = readFileSync(join(projectDir, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    expect(root).toContain('ROOT_GEMINI_TRIPLE');
    expect(root).toContain('ROOT_CLAUDE_TRIPLE');
  });
});
