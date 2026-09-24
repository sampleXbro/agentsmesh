/**
 * The MCP `check` tool delegates to the CLI `runCheck`, so it fails on the same
 * things as `agentsmesh check`, and maps the CLI data onto the MCP result.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { runCheck } from '../../../../src/cli/commands/check.js';
import type { CheckData } from '../../../../src/cli/command-result.js';
import type { McpContext } from '../../../../src/mcp/context.js';

const mockRunCheck = vi.fn<typeof runCheck>();

vi.mock('../../../../src/cli/commands/check.js', () => ({ runCheck: mockRunCheck }));

const { orchestrateHandlers } = await import('../../../../src/mcp/handlers/orchestrate.js');

const ctx: McpContext = { projectRoot: '/project', loadCanonical: vi.fn() };

const IN_SYNC: CheckData = {
  hasLock: true,
  lockConflict: false,
  canonicalDrift: false,
  outputDrift: false,
  inSync: true,
  modified: [],
  added: [],
  removed: [],
  extendsModified: [],
  lockedViolations: [],
  outputsModified: [],
  outputsRemoved: [],
  outputsStale: [],
  staleTargets: [],
  outputsUntracked: [],
  outputsChecked: true,
};

beforeEach(() => vi.clearAllMocks());

describe('orchestrateHandlers.check', () => {
  it('runs the CLI check for the project root with no flags', async () => {
    mockRunCheck.mockResolvedValue({ exitCode: 0, data: IN_SYNC });

    await orchestrateHandlers.check(ctx);

    expect(mockRunCheck).toHaveBeenCalledWith({}, '/project');
  });

  it('maps canonical and output drift onto the MCP result', async () => {
    mockRunCheck.mockResolvedValue({
      exitCode: 1,
      data: {
        ...IN_SYNC,
        inSync: false,
        canonicalDrift: true,
        outputDrift: true,
        modified: ['rules/foo.md'],
        added: ['rules/new.md'],
        removed: ['rules/old.md'],
        outputsModified: ['AGENTS.md'],
        outputsRemoved: ['.claude/CLAUDE.md'],
        outputsStale: ['.cursor/rules/orphaned.mdc'],
        staleTargets: [],
      },
    });

    expect(await orchestrateHandlers.check(ctx)).toEqual({
      drift: true,
      lockConflict: false,
      lessonsGraphError: null,
      canonicalDrift: true,
      outputDrift: true,
      missing: ['rules/old.md'],
      extra: ['rules/new.md'],
      modified: ['rules/foo.md'],
      outputsModified: ['AGENTS.md'],
      outputsRemoved: ['.claude/CLAUDE.md'],
      outputsStale: ['.cursor/rules/orphaned.mdc'],
      staleTargets: [],
      outputsChecked: true,
    });
  });

  it('reports the CLI error for an unreadable lessons graph', async () => {
    const error = 'Lessons graph unreadable: .agentsmesh/lessons/lessons.json is not valid JSON.';
    mockRunCheck.mockResolvedValue({ exitCode: 1, data: IN_SYNC, error });

    const out = await orchestrateHandlers.check(ctx);

    expect([out.drift, out.lessonsGraphError]).toEqual([false, error]);
  });

  it('wraps a check failure via wrapEngineError', async () => {
    mockRunCheck.mockRejectedValue(new Error('check boom'));
    await expect(orchestrateHandlers.check(ctx)).rejects.toMatchObject({ code: 'IO_ERROR' });
  });
});
