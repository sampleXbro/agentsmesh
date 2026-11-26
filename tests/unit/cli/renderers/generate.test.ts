import { describe, expect, it } from 'vitest';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { useCapturedOutput } from './renderer-test-helpers.js';
import type { GenerateData } from '../../../../src/cli/command-result.js';

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

describe('renderGenerate with files of a removed target', () => {
  const output = useCapturedOutput();
  const REMOVED = ['.cursor/AGENTS.md', '.cursor/rules/general.mdc'];
  const KEPT = [
    { path: '.cursor/mcp.json', reason: 'shared' as const },
    { path: '.cursor/rules/mine.mdc', reason: 'edited' as const },
  ];
  const unchanged = (n: number): GenerateData['files'] =>
    Array.from({ length: n }, (_, i) => ({
      path: `f${i}.md`,
      target: 'codex-cli',
      status: 'unchanged' as const,
    }));
  const run = (data: Partial<GenerateData>, exitCode = 0): void =>
    renderGenerate({
      exitCode,
      lockWritten: data.mode === 'generate',
      data: {
        scope: 'project',
        mode: 'generate',
        files: unchanged(13),
        summary: { created: 0, updated: 0, unchanged: 13 },
        ...data,
      },
    });

  it('counts the removed files in the summary instead of saying nothing changed', () => {
    run({ removed: [...REMOVED, '.cursor/skills/demo/SKILL.md'] });

    expect(output.stdout()).toBe(
      [
        '✓ removed .cursor/AGENTS.md',
        '✓ removed .cursor/rules/general.mdc',
        '✓ removed .cursor/skills/demo/SKILL.md',
        'Generated: 0 created, 0 updated, 3 removed, 13 unchanged',
        '',
      ].join('\n'),
    );
  });

  it('keeps the old summary wording when nothing was removed', () => {
    run({ summary: { created: 1, updated: 0, unchanged: 12 } });

    expect(output.stdout()).toBe('Generated: 1 created, 0 updated, 12 unchanged\n');
  });

  it('prints the removed count when a run also created files', () => {
    run({ summary: { created: 2, updated: 1, unchanged: 10 }, removed: REMOVED });

    expect(output.stdout()).toContain('Generated: 2 created, 1 updated, 2 removed, 10 unchanged');
  });

  it('prints removals and a summary when the run produced no files at all', () => {
    run({ files: [], summary: { created: 0, updated: 0, unchanged: 0 }, removed: REMOVED });

    expect(output.stdout()).toBe(
      [
        'No files to generate (no root rule or rules feature disabled).',
        '✓ removed .cursor/AGENTS.md',
        '✓ removed .cursor/rules/general.mdc',
        'Generated: 0 created, 0 updated, 2 removed, 0 unchanged',
        '',
      ].join('\n'),
    );
  });

  it('warns about every file it kept, with the reason', () => {
    run({ kept: KEPT });

    expect(output.stdout()).toBe('Nothing changed. (13 unchanged)\n');
    expect(output.stderr()).toBe(
      [
        '⚠ Kept .cursor/mcp.json: it is a shared tool config and no target generates it now. Remove the agentsmesh entries yourself if you do not need them.',
        '⚠ Kept .cursor/rules/mine.mdc: you edited it, and no target generates it now. Delete it yourself if you do not need it.',
        '',
      ].join('\n'),
    );
  });

  it('prints removals as would-be removals on --dry-run', () => {
    run({ mode: 'dry-run', files: unchanged(1), removed: REMOVED, kept: KEPT.slice(1) });

    expect(output.stdout()).toBe(
      [
        '[dry-run] unchanged f0.md (codex-cli)',
        '[dry-run] removed .cursor/AGENTS.md',
        '[dry-run] removed .cursor/rules/general.mdc',
        '',
      ].join('\n'),
    );
    expect(output.stderr()).toBe(
      '⚠ Kept .cursor/rules/mine.mdc: you edited it, and no target generates it now. Delete it yourself if you do not need it.\n',
    );
  });

  it('prefixes removed paths with ~/ in global scope', () => {
    run({ scope: 'global', removed: ['.cursor/AGENTS.md'] });

    expect(output.stdout()).toContain('✓ removed ~/.cursor/AGENTS.md');
  });

  it('fails the check and never says in sync while removed-target files are left', () => {
    run({ mode: 'check', removed: REMOVED }, 1);

    expect(output.stdout()).toBe('');
    expect(output.stderr()).toBe(
      [
        '✗ [check] stale .cursor/AGENTS.md',
        '✗ [check] stale .cursor/rules/general.mdc',
        "✗ Generated files are out of sync. Run 'agentsmesh generate' to remove them.",
        '',
      ].join('\n'),
    );
  });

  it('says update, not remove, when generated files drifted too', () => {
    run(
      {
        mode: 'check',
        files: [{ path: 'AGENTS.md', target: 'codex-cli', status: 'updated' }],
        summary: { created: 0, updated: 1, unchanged: 0 },
        removed: ['.cursor/AGENTS.md'],
      },
      1,
    );

    expect(output.stderr()).toBe(
      [
        '✗ [check] updated AGENTS.md (codex-cli)',
        '✗ [check] stale .cursor/AGENTS.md',
        "✗ Generated files are out of sync. Run 'agentsmesh generate' to update them.",
        '',
      ].join('\n'),
    );
  });

  it('stays in sync under --check when files were only kept, and only warns', () => {
    run({ mode: 'check', kept: KEPT.slice(1) });

    expect(output.stdout()).toBe('✓ Generated files are in sync.\n');
    expect(output.stderr()).toBe(
      '⚠ Kept .cursor/rules/mine.mdc: you edited it, and no target generates it now. Delete it yourself if you do not need it.\n',
    );
  });

  it('does not claim in sync for an empty check run that found removed-target files', () => {
    run({ mode: 'check', files: [], removed: REMOVED }, 1);

    expect(output.stdout()).toBe(
      'No files to generate (no root rule or rules feature disabled).\n',
    );
    expect(output.stderr()).toBe(
      [
        '✗ [check] stale .cursor/AGENTS.md',
        '✗ [check] stale .cursor/rules/general.mdc',
        "✗ Generated files are out of sync. Run 'agentsmesh generate' to remove them.",
        '',
      ].join('\n'),
    );
  });
});
