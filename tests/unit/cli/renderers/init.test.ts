import { describe, expect, it } from 'vitest';
import { renderInit } from '../../../../src/cli/renderers/init.js';
import { useCapturedOutput } from './renderer-test-helpers.js';

describe('renderInit', () => {
  const output = useCapturedOutput();

  it('prints detected configs and the manual import hint when nothing was imported', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: ['claude-code'],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'full',
        gitignoreUpdated: false,
      },
    });

    expect(output.stdout()).toContain('Found existing configurations: claude-code');
    expect(output.stdout()).toContain("Run 'agentsmesh init --yes' to auto-import");
    expect(output.stdout()).toContain('Created agentsmesh.yaml');
    expect(output.stdout()).not.toContain('Updated .gitignore');
  });

  it('prints auto-import mappings, target suffix, and gitignore update', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: ['claude-code', 'cursor'],
        imported: [{ from: '.claude/CLAUDE.md', to: '.agentsmesh/rules/_root.md' }],
        importedToolCount: 2,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'gap-fill',
        gitignoreUpdated: true,
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('Auto-importing existing configurations (--yes)...');
    expect(stdout).toContain('.claude/CLAUDE.md');
    expect(stdout).toContain('.agentsmesh/rules/_root.md');
    expect(stdout).toContain('Imported 1 file(s) from 2 tool(s).');
    expect(stdout).toContain('Created agentsmesh.yaml (targets: claude-code, cursor)');
    expect(stdout).toContain('Created agentsmesh.local.yaml');
    expect(stdout).toContain('Updated .gitignore');
  });

  it('does not append target suffix when imports were not from detected configs', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'global',
        configFile: '.agentsmesh/agentsmesh.yaml',
        localConfigFile: '.agentsmesh/agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [{ from: '.cursor/rules/a.mdc', to: '.agentsmesh/rules/a.md' }],
        importedToolCount: 1,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
      },
    });

    expect(output.stdout()).toContain('Created .agentsmesh/agentsmesh.yaml\n');
    expect(output.stdout()).not.toContain('(targets:');
  });

  it('renders the lessons block after the standard init when --lessons creates files', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'full',
        gitignoreUpdated: false,
        lessons: {
          created: [`${process.cwd()}/.agentsmesh/lessons/lessons.json`],
          updated: [],
          skipped: [],
          rootRuleUpdated: true,
          gitignoreUpdated: false,
        },
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('Created agentsmesh.yaml');
    expect(stdout).toContain('Created .agentsmesh/lessons/lessons.json');
    expect(stdout).toContain('Injected the Lessons ritual block into .agentsmesh/rules/_root.md');
    expect(stdout).toContain('Lessons subsystem ready (.agentsmesh/lessons/).');
    // The recall-log gitignore line is only printed when the entry was actually added.
    expect(stdout).not.toContain('recall-log.jsonl to .gitignore');
  });

  it('reports the recall-log gitignore entry when the lessons scaffold updated .gitignore', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
        lessonsOnly: true,
        lessons: {
          created: [`${process.cwd()}/.agentsmesh/lessons/lessons.json`],
          updated: [],
          skipped: [],
          rootRuleUpdated: true,
          gitignoreUpdated: true,
        },
      },
    });

    // Five runtime files are gitignored now (logs, lock, temp files), not one.
    expect(output.stdout()).toContain(
      'lessons runtime files (logs, lock, temp files) to .gitignore',
    );
    expect(output.stdout()).not.toContain('recall-log.jsonl to .gitignore');
  });

  it('reports the merge-driver binding and the per-clone setup it performed', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
        lessonsOnly: true,
        lessons: {
          created: [`${process.cwd()}/.agentsmesh/lessons/lessons.json`],
          updated: [],
          skipped: [],
          rootRuleUpdated: true,
          gitignoreUpdated: false,
          gitattributesUpdated: true,
          recallHookInjected: false,
          mergeDriver: {
            status: 'configured',
            command: 'agentsmesh lessons merge-driver %O %A %B',
          },
          recallHookTeamHint: null,
        },
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('merge driver in .gitattributes');
    // The per-clone half is performed now, not printed as manual steps.
    expect(stdout).toContain('Enabled the lessons.json merge driver for this clone');
    expect(stdout).not.toContain('each clone enables the merge driver once');
    expect(stdout).toContain("gets the same setup the next time they run 'agentsmesh generate'");
  });

  it('says so plainly when the merge driver could not be enabled', () => {
    renderInit({
      exitCode: 0,
      data: {
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
        lessonsOnly: true,
        lessons: {
          created: [],
          updated: [],
          skipped: [],
          rootRuleUpdated: false,
          gitignoreUpdated: false,
          gitattributesUpdated: true,
          recallHookInjected: false,
          mergeDriver: {
            status: 'failed',
            command: 'agentsmesh lessons merge-driver %O %A %B',
            reason: '`agentsmesh` is not on PATH',
          },
          recallHookTeamHint: null,
        },
      },
    });
    expect(output.stdout() + output.stderr()).toContain(
      'Could not enable the lessons.json merge driver',
    );
  });

  it('renders Kept lines for skipped paths and notes the already-present paragraph', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'full',
        gitignoreUpdated: false,
        lessons: {
          created: [],
          updated: [],
          skipped: [`${process.cwd()}/.agentsmesh/lessons/lessons.json`],
          rootRuleUpdated: false,
          gitignoreUpdated: false,
        },
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('Kept .agentsmesh/lessons/lessons.json (already current)');
    expect(stdout).toContain(
      '.agentsmesh/rules/_root.md already carries the current Lessons block',
    );
  });

  it('lessons-only retrofit skips standard init lines and prints the generate hint', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'none',
        gitignoreUpdated: false,
        lessonsOnly: true,
        lessons: {
          created: [`${process.cwd()}/.agentsmesh/lessons/lessons.json`],
          updated: [],
          skipped: [],
          rootRuleUpdated: true,
          gitignoreUpdated: false,
        },
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('Lessons subsystem ready (.agentsmesh/lessons/).');
    expect(stdout).toContain("Run 'agentsmesh generate'");
    expect(stdout).not.toContain('Created agentsmesh.yaml');
    expect(stdout).not.toContain('Created agentsmesh.local.yaml');
  });

  it('lessonsOnly without lessons payload falls through to standard rendering (defensive guard)', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: [],
        targetSource: 'explicit',
        scaffoldType: 'full',
        gitignoreUpdated: false,
        lessonsOnly: true,
      },
    });

    expect(output.stdout()).toContain('Created agentsmesh.yaml');
  });

  it('explains an undetected default and names the flag that changes it', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: ['claude-code', 'copilot', 'cursor'],
        targetSource: 'fallback',
        scaffoldType: 'full',
        gitignoreUpdated: false,
      },
    });

    const stdout = output.stdout();
    expect(stdout).toContain('Enabled 3 targets');
    expect(stdout).toContain('no tool config or install found');
    expect(stdout).toContain('claude-code, copilot, cursor');
    expect(stdout).toContain('--targets a,b');
  });

  it('stays quiet about targets when the user chose them', () => {
    renderInit({
      exitCode: 0,
      data: {
        scope: 'project',
        configFile: 'agentsmesh.yaml',
        localConfigFile: 'agentsmesh.local.yaml',
        detectedConfigs: [],
        imported: [],
        importedToolCount: 0,
        targets: ['zed'],
        targetSource: 'explicit',
        scaffoldType: 'full',
        gitignoreUpdated: false,
      },
    });

    expect(output.stdout()).not.toContain('Enabled 1 target');
  });
});
