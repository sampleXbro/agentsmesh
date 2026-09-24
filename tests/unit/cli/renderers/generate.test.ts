import { describe, expect, it } from 'vitest';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

describe('renderGenerate', () => {
  const output = useCapturedOutput();

  it('prints no-files messages for generate and check modes', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: true,
      data: {
        scope: 'project',
        mode: 'generate',
        files: [],
        summary: { created: 0, updated: 0, unchanged: 0 },
      },
    });
    renderGenerate({
      exitCode: 0,
      lockWritten: false,
      data: {
        scope: 'project',
        mode: 'check',
        files: [],
        summary: { created: 0, updated: 0, unchanged: 0 },
      },
    });

    expect(output.stdout()).toContain('No files to generate');
    expect(output.stdout()).toContain('Generated files are in sync.');
  });

  it('uses the default empty cause when no emptyReason is set', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: true,
      data: {
        scope: 'global',
        mode: 'generate',
        files: [],
        summary: { created: 0, updated: 0, unchanged: 0 },
      },
    });
    expect(output.stdout()).toContain('no root rule or rules feature disabled');
    expect(output.stdout()).not.toContain('no global mode');
  });

  it('reports the no-global-support cause when emptyReason is set', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: true,
      data: {
        scope: 'global',
        mode: 'generate',
        files: [],
        summary: { created: 0, updated: 0, unchanged: 0 },
        emptyReason: 'no-global-support',
      },
    });
    expect(output.stdout()).toContain('target has no global mode — try without --global');
    expect(output.stdout()).not.toContain('no root rule or rules feature disabled');
  });

  it('prints check success when all files are unchanged', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: false,
      data: {
        scope: 'project',
        mode: 'check',
        files: [{ path: 'AGENTS.md', target: 'codex-cli', status: 'unchanged' }],
        summary: { created: 0, updated: 0, unchanged: 1 },
      },
    });

    expect(output.stdout()).toContain('Generated files are in sync.');
    expect(output.stderr()).toBe('');
  });

  it('prints drifted files in check mode', () => {
    renderGenerate({
      exitCode: 1,
      lockWritten: false,
      data: {
        scope: 'global',
        mode: 'check',
        files: [
          { path: '.codex/AGENTS.md', target: 'codex-cli', status: 'created' },
          { path: '.cursor/rules/a.mdc', target: 'cursor', status: 'unchanged' },
        ],
        summary: { created: 1, updated: 0, unchanged: 1 },
      },
    });

    expect(output.stderr()).toContain('[check] created ~/.codex/AGENTS.md (codex-cli)');
    expect(output.stderr()).toContain('Generated files are out of sync.');
    expect(output.stderr()).not.toContain('.cursor/rules/a.mdc');
  });

  it('prints dry-run output without a summary', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: false,
      data: {
        scope: 'global',
        mode: 'dry-run',
        files: [{ path: '.claude/CLAUDE.md', target: 'claude-code', status: 'updated' }],
        summary: { created: 0, updated: 1, unchanged: 0 },
      },
    });

    expect(output.stdout()).toContain('[dry-run] updated ~/.claude/CLAUDE.md (claude-code)');
    expect(output.stdout()).not.toContain('Generated:');
  });

  it('prints normal generation summaries for changed and unchanged runs', () => {
    renderGenerate({
      exitCode: 0,
      lockWritten: true,
      data: {
        scope: 'project',
        mode: 'generate',
        files: [
          { path: 'AGENTS.md', target: 'codex-cli', status: 'created' },
          { path: '.cursor/rules/a.mdc', target: 'cursor', status: 'updated' },
          { path: '.claude/CLAUDE.md', target: 'claude-code', status: 'unchanged' },
        ],
        summary: { created: 1, updated: 1, unchanged: 1 },
      },
    });
    renderGenerate({
      exitCode: 0,
      lockWritten: true,
      data: {
        scope: 'project',
        mode: 'generate',
        files: [{ path: 'AGENTS.md', target: 'codex-cli', status: 'unchanged' }],
        summary: { created: 0, updated: 0, unchanged: 1 },
      },
    });

    expect(output.stdout()).toContain('created AGENTS.md');
    expect(output.stdout()).toContain('updated .cursor/rules/a.mdc');
    expect(output.stdout()).toContain('Generated: 1 created, 1 updated, 1 unchanged');
    expect(output.stdout()).toContain('Nothing changed. (1 unchanged)');
  });
});
