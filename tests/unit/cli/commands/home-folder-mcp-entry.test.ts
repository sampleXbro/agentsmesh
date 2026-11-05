import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedAgentsmeshMcpEntry } from '../../../../src/cli/commands/seed-mcp-entry.js';
import { runImport } from '../../../../src/cli/commands/import.js';
import { applyInitPlan, type InitPlan } from '../../../../src/cli/commands/init-apply.js';
import { resolveScopeContext } from '../../../../src/config/core/scope.js';
import {
  TEMPLATE_MCP,
  TEMPLATE_MCP_GLOBAL,
} from '../../../../src/cli/commands/init-mcp-templates.js';

// The home folder's .agentsmesh is the global config, so the project-only
// agentsmesh MCP entry must never land there, even from a project-scope command.
let home = '';

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'am-home-mcp-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

const homeMcp = (): string => join(home, '.agentsmesh', 'mcp.json');

function projectPlan(doImport: boolean): InitPlan {
  return {
    scope: 'project',
    targets: ['claude-code'],
    targetSource: 'explicit',
    detected: [],
    doImport,
    lessons: false,
  };
}

describe('agentsmesh MCP entry in the home folder (project scope)', () => {
  it('seedAgentsmeshMcpEntry writes nothing there, by either path name', async () => {
    expect(await seedAgentsmeshMcpEntry(home)).toBe(false);
    expect(await seedAgentsmeshMcpEntry(realpathSync(home))).toBe(false);
    expect(existsSync(homeMcp())).toBe(false);
  });

  it('import keeps the tool servers and adds no entry', async () => {
    writeFileSync(join(home, 'CLAUDE.md'), '# Root\n');
    writeFileSync(
      join(home, '.mcp.json'),
      JSON.stringify({ mcpServers: { mine: { command: 'my-tool', args: [] } } }),
    );

    await runImport({ from: 'claude-code' }, home);

    const mcp = JSON.parse(readFileSync(homeMcp(), 'utf-8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['mine']);
  });

  it.each([false, true])('init writes the global template (doImport: %s)', async (doImport) => {
    await applyInitPlan(home, resolveScopeContext(home, 'project'), projectPlan(doImport));

    expect(readFileSync(homeMcp(), 'utf-8')).toBe(TEMPLATE_MCP_GLOBAL);
  });

  it('a project below the home folder still gets the entry', async () => {
    const initProject = join(home, 'init-project');
    const seedProject = join(home, 'seed-project');
    mkdirSync(initProject);
    mkdirSync(seedProject);

    await applyInitPlan(
      initProject,
      resolveScopeContext(initProject, 'project'),
      projectPlan(false),
    );

    expect(readFileSync(join(initProject, '.agentsmesh', 'mcp.json'), 'utf-8')).toBe(TEMPLATE_MCP);
    expect(await seedAgentsmeshMcpEntry(seedProject)).toBe(true);
    const seeded = JSON.parse(readFileSync(join(seedProject, '.agentsmesh', 'mcp.json'), 'utf-8'));
    expect(Object.keys(seeded.mcpServers)).toEqual(['agentsmesh']);
  });
});
