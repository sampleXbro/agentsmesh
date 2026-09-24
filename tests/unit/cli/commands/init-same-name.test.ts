/**
 * `init --yes` imports every detected tool in one run. When two tools have a
 * rule, command or agent with the same name and different text, both are kept:
 * the later tool's copy gets a `-<tool>` name, and nothing is mixed (#132).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTempProject } from '../../../helpers/temp-project.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { runInit } from '../../../../src/cli/commands/init.js';

const { root, write, read } = useTempProject('am-init-same-');

const CLAUDE_TS = '---\nroot: false\ndescription: ts\nglobs: []\n---\n\n# TS\nCLAUDE_TS_TEXT';
const CURSOR_TS =
  '---\nroot: false\ndescription: ts\nglobs:\n  - src/**/*.ts\ntrigger: model_decision\n---\n\n' +
  '# TS\nCURSOR_TS_TEXT';

function sameNameRules(): void {
  write('CLAUDE.md', '# Root\n');
  write('.claude/rules/typescript.md', '---\ndescription: ts\n---\n# TS\nCLAUDE_TS_TEXT\n');
  write(
    '.cursor/rules/typescript.mdc',
    '---\ndescription: ts\nglobs: src/**/*.ts\nalwaysApply: false\n---\n# TS\nCURSOR_TS_TEXT\n',
  );
}

beforeEach(() => {
  // init reads HOME to pick targets; keep this machine's tools out of it.
  const home = join(root(), 'home');
  mkdirSync(home);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('init --yes with same-name entries in two tools', () => {
  it('keeps both rules, each with only its own frontmatter', async () => {
    sameNameRules();
    write('.claude/rules/claude-only.md', '---\ndescription: c\n---\nCLAUDE_ONLY\n');

    const { data } = await runInit(root(), { yes: true });

    expect(data.detectedConfigs).toEqual(['claude-code', 'cursor']);
    expect(read('.agentsmesh/rules/typescript.md')).toBe(CLAUDE_TS);
    expect(read('.agentsmesh/rules/typescript-cursor.md')).toBe(CURSOR_TS);
    expect(read('.agentsmesh/rules/claude-only.md')).toContain('CLAUDE_ONLY');
    expect(data.sameNameCopies).toEqual([
      {
        path: '.agentsmesh/rules/typescript.md',
        copy: '.agentsmesh/rules/typescript-cursor.md',
        tool: 'cursor',
      },
    ]);
    expect(data.imported).toContainEqual({
      from: '.cursor/rules/typescript.mdc',
      to: '.agentsmesh/rules/typescript-cursor.md',
    });
  });

  it('generate then writes both texts to both tools', async () => {
    sameNameRules();
    await runInit(root(), { yes: true });

    await runGenerate({}, root(), { printMatrix: false });

    expect(read('.claude/rules/typescript.md')).toContain('CLAUDE_TS_TEXT');
    expect(read('.claude/rules/typescript-cursor.md')).toContain('CURSOR_TS_TEXT');
    expect(read('.cursor/rules/typescript.mdc')).toContain('CLAUDE_TS_TEXT');
    expect(read('.cursor/rules/typescript-cursor.mdc')).toContain('CURSOR_TS_TEXT');
  });

  it('keeps both commands without mixing their descriptions', async () => {
    write('CLAUDE.md', '# Root\n');
    write('.claude/commands/deploy.md', '---\ndescription: Deploy\n---\nCLAUDE_DEPLOY\n');
    write('.cursor/commands/deploy.md', 'CURSOR_DEPLOY\n');
    write('.cursor/rules/style.mdc', '---\ndescription: Style\n---\n# Style\n');

    const { data } = await runInit(root(), { yes: true });

    expect(read('.agentsmesh/commands/deploy.md')).toBe(
      '---\ndescription: Deploy\nallowed-tools: []\n---\n\nCLAUDE_DEPLOY',
    );
    expect(read('.agentsmesh/commands/deploy-cursor.md')).toBe(
      '---\ndescription: ""\nallowed-tools: []\n---\n\nCURSOR_DEPLOY',
    );
    expect(data.sameNameCopies).toEqual([
      {
        path: '.agentsmesh/commands/deploy.md',
        copy: '.agentsmesh/commands/deploy-cursor.md',
        tool: 'cursor',
      },
    ]);
  });

  it('keeps one file when both tools have the same text', async () => {
    write('CLAUDE.md', '# Root\n');
    write('.claude/rules/typescript.md', '---\ndescription: ts\n---\n# TS\nSAME_TEXT\n');
    write('.cursor/rules/typescript.mdc', '---\ndescription: ts\n---\n# TS\nSAME_TEXT\n');

    const { data } = await runInit(root(), { yes: true });

    expect(read('.agentsmesh/rules/typescript.md')).toBe(
      '---\nroot: false\ndescription: ts\nglobs: []\n---\n\n# TS\nSAME_TEXT',
    );
    expect(data.sameNameCopies).toEqual([]);
  });
});
