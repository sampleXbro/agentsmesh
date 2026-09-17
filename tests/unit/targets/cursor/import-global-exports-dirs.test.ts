/**
 * Directory-listing branches in src/targets/cursor/import-global-exports-helpers.ts:
 * the `.some((f) => f.endsWith('.md'))` checks for skills/agents/commands and the
 * commands `mapEntry` arrow. Runs against the real filesystem.
 */
import { AB_COMMANDS } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ImportResult } from '../../../../src/core/types.js';
import {
  hasGlobalCursorArtifacts,
  importGlobalCommands,
} from '../../../../src/targets/cursor/import-global-exports-helpers.js';
import {
  CURSOR_TARGET,
  CURSOR_SKILLS_DIR,
  CURSOR_AGENTS_DIR,
  CURSOR_COMMANDS_DIR,
} from '../../../../src/targets/cursor/constants.js';

let projectRoot: string;
const noopNorm = (content: string): string => content;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): void {
  const abs = join(projectRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe('hasGlobalCursorArtifacts — directory listings', () => {
  it('returns true when the skills dir holds a .md file', async () => {
    writeFile(`${CURSOR_SKILLS_DIR}/my-skill/SKILL.md`, '# skill');
    expect(await hasGlobalCursorArtifacts(projectRoot)).toBe(true);
  });

  it('returns true via the agents branch when skills only hold non-md files', async () => {
    writeFile(`${CURSOR_SKILLS_DIR}/notes.txt`, 'txt');
    writeFile(`${CURSOR_AGENTS_DIR}/a.md`, '# agent');
    expect(await hasGlobalCursorArtifacts(projectRoot)).toBe(true);
  });

  it('returns true via the commands branch when skills and agents only hold non-md files', async () => {
    writeFile(`${CURSOR_SKILLS_DIR}/notes.txt`, 'txt');
    writeFile(`${CURSOR_AGENTS_DIR}/notes.txt`, 'txt');
    writeFile(`${CURSOR_COMMANDS_DIR}/c.md`, '# command');
    expect(await hasGlobalCursorArtifacts(projectRoot)).toBe(true);
  });

  it('returns false when all three dirs only hold non-md files', async () => {
    writeFile(`${CURSOR_SKILLS_DIR}/notes.txt`, 'txt');
    writeFile(`${CURSOR_AGENTS_DIR}/notes.txt`, 'txt');
    writeFile(`${CURSOR_COMMANDS_DIR}/notes.txt`, 'txt');
    expect(await hasGlobalCursorArtifacts(projectRoot)).toBe(false);
  });
});

describe('importGlobalCommands', () => {
  it('writes each command .md into the canonical commands dir', async () => {
    writeFile(`${CURSOR_COMMANDS_DIR}/deploy.md`, '---\ndescription: Deploy\n---\nRun deploy.');
    const results: ImportResult[] = [];

    await importGlobalCommands(projectRoot, results, noopNorm);

    expect(results).toEqual([
      {
        fromTool: CURSOR_TARGET,
        fromPath: join(projectRoot, CURSOR_COMMANDS_DIR, 'deploy.md'),
        toPath: `${AB_COMMANDS}/deploy.md`,
        feature: 'commands',
      },
    ]);
    const destPath = join(projectRoot, AB_COMMANDS, 'deploy.md');
    expect(existsSync(destPath)).toBe(true);
    const written = readFileSync(destPath, 'utf-8');
    expect(written).toContain('description: Deploy');
    expect(written).toContain('Run deploy.');
  });
});
