import { describe, expect, it } from 'vitest';
import {
  getTargetLayout,
  getTargetManagedOutputs,
  getTargetPrimaryRootInstructionPath,
  getTargetDetectionPaths,
} from '../../../src/targets/catalog/builtin-targets.js';

describe('target layout metadata', () => {
  it('returns the project layout for claude-code', () => {
    const layout = getTargetLayout('claude-code');

    expect(layout?.rootInstructionPath).toBe('CLAUDE.md');
    expect(layout?.skillDir).toBe('.claude/skills');
    expect(
      layout?.paths.rulePath('example', {
        source: 'example.md',
        root: false,
        targets: [],
        description: '',
        globs: [],
        body: '',
      }),
    ).toBe('.claude/rules/example.md');
  });

  it('returns managed outputs from descriptor metadata', () => {
    expect(getTargetManagedOutputs('codex-cli')).toEqual({
      dirs: ['.agents/skills', '.codex/agents', '.codex/instructions', '.codex/rules'],
      files: ['AGENTS.md'],
      // Co-owned: Codex writes its own model/provider/trust state into
      // config.toml, and hooks.json is hand-authored (it also carries a
      // top-level `description` agentsmesh does not own).
      coOwnedFiles: ['.codex/config.toml', '.codex/hooks.json'],
    });
  });

  it('returns the primary root instruction path from layout metadata', () => {
    expect(getTargetPrimaryRootInstructionPath('cursor')).toBe('.cursor/rules/general.mdc');
  });

  it('lists extra root-decoration paths for Cursor project layout', () => {
    expect(getTargetLayout('cursor')).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.cursor/rules/general.mdc',
        outputFamilies: [
          {
            id: 'root-mirrors',
            kind: 'additional',
            explicitPaths: ['AGENTS.md', '.cursor/AGENTS.md'],
          },
        ],
      }),
    );
  });

  it('lists extra root-decoration paths for Gemini CLI project layout', () => {
    expect(getTargetLayout('gemini-cli')).toEqual(
      expect.objectContaining({
        rootInstructionPath: 'GEMINI.md',
        outputFamilies: [{ id: 'compat-agents', kind: 'additional', explicitPaths: ['AGENTS.md'] }],
      }),
    );
  });

  it('returns undefined for missing global layout metadata', () => {
    expect(getTargetLayout('claude-code', 'global')).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.claude/CLAUDE.md',
        skillDir: '.claude/skills',
        managedOutputs: {
          dirs: [
            '.claude/agents',
            '.claude/commands',
            '.claude/rules',
            '.claude/skills',
            '.claude/output-styles',
            '.agents/skills',
          ],
          files: ['.claude/CLAUDE.md', '.claude/hooks.json'],
          coOwnedFiles: ['.claude.json', '.claude/settings.json'],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
        renderPrimaryRootInstruction: expect.any(Function),
        rewriteGeneratedPath: expect.any(Function),
      }),
    );
  });

  it('returns the Antigravity global layout metadata', () => {
    const layout = getTargetLayout('antigravity', 'global');
    expect(layout).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.gemini/GEMINI.md',
        skillDir: '.gemini/config/skills',
        managedOutputs: {
          dirs: [
            '.gemini/config/agents',
            '.gemini/config/skills',
            '.gemini/antigravity/global_workflows',
          ],
          files: ['.gemini/GEMINI.md'],
          coOwnedFiles: ['.gemini/config/mcp_config.json', '.gemini/config/hooks.json'],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
        renderPrimaryRootInstruction: expect.any(Function),
        rewriteGeneratedPath: expect.any(Function),
      }),
    );
    const mockConfig = {} as import('../../../src/config/core/schema.js').ValidatedConfig;
    expect(layout?.paths.commandPath('deploy', mockConfig)).toBe(
      '.gemini/antigravity/global_workflows/deploy.md',
    );
  });

  it('lists Cursor global detection paths for ~/.cursor rules and tooling', () => {
    expect(getTargetDetectionPaths('cursor', 'global')).toEqual([
      '.cursor/rules/general.mdc',
      '.cursor/AGENTS.md',
      '.cursor/mcp.json',
      '.cursor/hooks.json',
      '.cursorignore',
      '.cursor/skills',
      '.cursor/agents',
      '.cursor/commands',
      '.agentsmesh-exports/cursor/user-rules.md',
    ]);
  });

  it('returns the Cursor global layout metadata', () => {
    expect(getTargetLayout('cursor', 'global')).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.cursor/rules/general.mdc',
        outputFamilies: [
          {
            id: 'root-mirrors',
            kind: 'additional',
            explicitPaths: ['AGENTS.md', '.cursor/AGENTS.md'],
          },
        ],
        skillDir: '.cursor/skills',
        managedOutputs: {
          dirs: ['.cursor/rules', '.cursor/commands', '.cursor/agents', '.cursor/skills'],
          files: [
            '.cursor/rules/general.mdc',
            '.cursor/AGENTS.md',
            '.agentsmesh-exports/cursor/user-rules.md',
          ],
          coOwnedFiles: ['.cursor/mcp.json', '.cursor/hooks.json', '.cursor/cli-config.json'],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
      }),
    );
  });

  it('returns the Codex global layout metadata', () => {
    expect(getTargetLayout('codex-cli', 'global')).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.codex/AGENTS.md',
        skillDir: '.agents/skills',
        managedOutputs: {
          dirs: ['.agents/skills', '.codex/agents', '.codex/rules'],
          files: ['.codex/AGENTS.md'],
          coOwnedFiles: ['.codex/config.toml', '.codex/hooks.json'],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
      }),
    );
  });

  it('returns the Cline global layout metadata', () => {
    const layout = getTargetLayout('cline', 'global');
    expect(layout).toEqual(
      expect.objectContaining({
        skillDir: '.cline/data/settings/skills',
        managedOutputs: {
          dirs: [
            '.cline/data/settings/rules',
            'Documents/Cline/Workflows',
            '.cline/hooks',
            '.cline/data/settings/skills',
            '.agents/skills',
          ],
          files: [],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
        rewriteGeneratedPath: expect.any(Function),
        mirrorGlobalPath: expect.any(Function),
      }),
    );
    expect(
      layout!.paths.rulePath('typescript', {
        source: 'typescript.md',
        root: false,
        targets: [],
        description: '',
        globs: [],
        body: '',
      }),
    ).toBe('.cline/data/settings/rules/typescript.md');
    expect(layout!.paths.commandPath('commit', {} as never)).toBe(
      'Documents/Cline/Workflows/commit.md',
    );
  });

  it('lists Cline global detection paths', () => {
    expect(getTargetDetectionPaths('cline', 'global')).toEqual([
      '.cline/data/settings/rules',
      'Documents/Cline/Workflows',
      '.cline/hooks',
      '.cline/data/settings/skills',
    ]);
  });

  it('returns the Continue global layout metadata', () => {
    const layout = getTargetLayout('continue', 'global');
    expect(layout).toEqual(
      expect.objectContaining({
        rootInstructionPath: '.continue/rules/general.md',
        skillDir: '.continue/skills',
        outputFamilies: [
          { id: 'compat-agents', kind: 'additional', explicitPaths: ['.continue/AGENTS.md'] },
        ],
        managedOutputs: {
          dirs: ['.continue/rules', '.continue/prompts', '.continue/skills', '.agents/skills'],
          files: [
            '.continue/mcpServers/agentsmesh.json',
            '.continue/AGENTS.md',
            '.continue/.continueignore',
          ],
          coOwnedFiles: [
            '.continue/config.yaml',
            '.continue/permissions.yaml',
            '.continue/settings.json',
          ],
        },
        paths: expect.objectContaining({
          rulePath: expect.any(Function),
          commandPath: expect.any(Function),
          agentPath: expect.any(Function),
        }),
        mirrorGlobalPath: expect.any(Function),
      }),
    );
    expect(
      layout!.paths.rulePath('typescript', {
        source: 'typescript.md',
        root: false,
        targets: [],
        description: '',
        globs: [],
        body: '',
      }),
    ).toBe('.continue/rules/typescript.md');
    expect(layout!.paths.commandPath('commit', {} as never)).toBe('.continue/prompts/commit.md');
    // Continue reads `.continue/agents/<name>.md` at both scopes (agentFiles.ts),
    // so agents are native rather than projected as skills.
    expect(layout!.paths.agentPath('my-agent', {} as never)).toBe('.continue/agents/my-agent.md');
  });

  it('lists Continue global detection paths', () => {
    expect(getTargetDetectionPaths('continue', 'global')).toEqual([
      '.continue/rules',
      '.continue/prompts',
      '.continue/mcpServers',
      '.continue/skills',
      '.continue/agents',
    ]);
  });

  it('returns undefined for unknown targets', () => {
    expect(getTargetLayout('unknown-target')).toBeUndefined();
    expect(getTargetManagedOutputs('unknown-target')).toBeUndefined();
    expect(getTargetPrimaryRootInstructionPath('unknown-target')).toBeUndefined();
  });
});
