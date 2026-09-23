/**
 * Unit tests for help output.
 */

import { describe, it, expect } from 'vitest';
import { printHelp, printCommandHelp } from '../../../src/cli/help.js';
import { COMMANDS } from '../../../src/cli/help-data.js';
import { LESSONS_SUBCOMMANDS } from '../../../src/cli/commands/lessons-usage.js';

describe('printHelp', () => {
  it('prints main help with commands and flags', () => {
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      printHelp();
      expect(output).toContain('agentsmesh');
      expect(output).toContain('init');
      expect(output).toContain('generate');
      expect(output).toContain('import');
      expect(output).toContain('install');
      expect(output).toContain('--targets');
      expect(output).toContain('--refresh-cache');
    } finally {
      process.stdout.write = write;
    }
  });
});

describe('printCommandHelp', () => {
  it('prints per-command help', () => {
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      printCommandHelp('generate');
      expect(output).toContain('agentsmesh generate');
      expect(output).toContain('Command flags:');
    } finally {
      process.stdout.write = write;
    }
  });

  it('prints check help with --no-outputs', () => {
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      printCommandHelp('check');
      expect(output).toContain('agentsmesh check');
      expect(output).toContain('--no-outputs');
    } finally {
      process.stdout.write = write;
    }
  });

  it('prints install help with --path, --target, --as, and --sync', () => {
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      printCommandHelp('install');
      expect(output).toContain('agentsmesh install');
      expect(output).toContain('--path');
      expect(output).toContain('--target');
      expect(output).toContain('--as');
      expect(output).toContain('--sync');
      expect(output).toContain('extends.target');
      expect(output).toContain('--dry-run');
      expect(output).toContain('--force');
    } finally {
      process.stdout.write = write;
    }
  });
});

describe('printCommandHelp — lessons subcommand focus', () => {
  function capture(fn: () => void): string {
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      fn();
    } finally {
      process.stdout.write = write;
    }
    return output;
  }

  it('focuses `lessons add --help` on add flags plus a worked example', () => {
    const out = capture(() => printCommandHelp('lessons', ['add']));
    expect(out).toContain('agentsmesh lessons add');
    expect(out).toContain('--topic');
    expect(out).toContain('--trigger-file');
    expect(out).toContain('Example:');
    // Focused: flags belonging to other subcommands are excluded.
    expect(out).not.toContain('--migrated-at'); // import-md
    expect(out).not.toContain('--max-tokens'); // query
  });

  it('focuses `lessons query --help` on query flags plus a worked example', () => {
    const out = capture(() => printCommandHelp('lessons', ['query']));
    expect(out).toContain('--file');
    expect(out).toContain('--cmd');
    expect(out).toContain('Example:');
    expect(out).not.toContain('--rule');
    expect(out).not.toContain('--migrated-at');
    // --ids adds an id to each printed rule; it does not print ids alone.
    expect(out).toMatch(/--ids +prefix each printed rule with its lesson id\n/);
  });

  it('falls back to the combined lessons help when no subcommand is given', () => {
    const out = capture(() => printCommandHelp('lessons'));
    // Combined view keeps every subcommand's flags.
    expect(out).toContain('--rule');
    expect(out).toContain('--max-tokens');
    expect(out).toContain('--migrated-at');
  });

  it('handles a subcommand with no usage example or specific flags (topics)', () => {
    const out = capture(() => printCommandHelp('lessons', ['topics']));
    expect(out).toContain('agentsmesh lessons topics');
    expect(out).toContain('(no command-specific flags)');
    expect(out).not.toContain('Example:');
  });

  it('shows the required <topic|lesson-id> positional for `show --help`, not a [flags] stub', () => {
    const out = capture(() => printCommandHelp('lessons', ['show']));
    expect(out).toContain('agentsmesh lessons show <topic|lesson-id>');
    expect(out).not.toContain('show [flags]');
  });

  it('documents `--dry-run` under `strip-markers --help`', () => {
    const out = capture(() => printCommandHelp('lessons', ['strip-markers']));
    expect(out).toContain('agentsmesh lessons strip-markers');
    expect(out).toContain('--dry-run');
    expect(out).not.toContain('(no command-specific flags)');
  });

  it('documents `--apply` and `--cap` under `prune --help`', () => {
    const out = capture(() => printCommandHelp('lessons', ['prune']));
    expect(out).toContain('--apply');
    expect(out).toContain('--cap');
  });

  it('documents the command-level `--json` under `stats --help`', () => {
    const out = capture(() => printCommandHelp('lessons', ['stats']));
    expect(out).toContain('--json');
    // Distinguish the stats-specific flag from the generic global --json.
    expect(out).toContain('recall-telemetry report as JSON');
  });

  it('documents `--rationale` under `add --help`', () => {
    const out = capture(() => printCommandHelp('lessons', ['add']));
    expect(out).toContain('--rationale');
  });

  it('combined `lessons --help` flag wall carries every per-subcommand flag', () => {
    const out = capture(() => printCommandHelp('lessons'));
    for (const flag of ['--rationale', '--dry-run', '--apply', '--cap']) {
      expect(out).toContain(flag);
    }
  });
});

describe('help-data — lessons command description (single source)', () => {
  it('enumerates exactly the canonical subcommands, generated from LESSONS_SUBCOMMANDS', () => {
    const lessons = COMMANDS.find((command) => command.name === 'lessons');
    expect(lessons).toBeDefined();
    const marker = 'Subcommands: ';
    const idx = lessons!.description.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const listed = lessons!.description
      .slice(idx + marker.length)
      .replace(/\.\s*$/, '')
      .split(', ');
    expect(listed).toEqual([...LESSONS_SUBCOMMANDS]);
  });
});
