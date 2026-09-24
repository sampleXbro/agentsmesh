import { describe, it, expect } from 'vitest';
import { renderLessons } from '../../../../src/cli/renderers/lessons.js';
import type { LessonsCommandResult } from '../../../../src/cli/commands/lessons-types.js';
import { LESSONS_SUBCOMMANDS, LESSONS_USAGE } from '../../../../src/cli/commands/lessons-usage.js';

// logger.info wraps each line in cyan ANSI codes unless NO_COLOR is set; strip
// them so line-exact assertions hold regardless of the runner's color setting.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

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
  return output.replace(ANSI, '');
}

function renderBareHelp(): string {
  const help: LessonsCommandResult = { subcommand: 'help', exitCode: 0, data: null };
  return capture(() => renderLessons(help));
}

/** The two-space-indented lines under "Subcommands:" are the subcommand menu. */
function subcommandLines(out: string): string[] {
  return out.split('\n').filter((line) => /^ {2}\S/.test(line));
}

/** The exact menu line each subcommand renders: signature (minus the shared
 *  `agentsmesh lessons ` prefix) plus its parenthetical summary, if any. */
function expectedLine(sub: string): string {
  const entry = LESSONS_USAGE[sub]!;
  const signature = entry.usage.replace(/^agentsmesh lessons /, '');
  const summary = entry.summary !== undefined ? `   (${entry.summary})` : '';
  return `  ${signature}${summary}`;
}

describe('renderLessons — bare `agentsmesh lessons` help menu', () => {
  it('prints the usage header and the Subcommands section', () => {
    const out = renderBareHelp();
    expect(out).toContain('Usage: agentsmesh lessons <subcommand> [args] [flags]');
    expect(out).toContain('Subcommands:');
  });

  it('lists exactly the canonical subcommands, in order, derived from LESSONS_USAGE', () => {
    const out = renderBareHelp();
    const expected = LESSONS_SUBCOMMANDS.map(expectedLine);
    expect(subcommandLines(out)).toEqual(expected);
  });

  it('includes `stats` and `prune` (the surfaces that previously disagreed)', () => {
    const out = renderBareHelp();
    expect(out).toContain('  stats [--json]');
    expect(out).toContain('  prune [--apply] [--cap <n>]');
  });

  it('shows the required positional for `show`, not a bare `[flags]` stub', () => {
    const out = renderBareHelp();
    expect(out).toContain('  show <topic|lesson-id>');
    expect(out).not.toContain('show [flags]');
  });
});

describe('renderLessons — `agentsmesh lessons help <subcommand>`', () => {
  it('prints that subcommand usage and example, not the overview', () => {
    const help: LessonsCommandResult = {
      subcommand: 'help',
      exitCode: 0,
      data: null,
      topic: 'add',
    };
    const out = capture(() => renderLessons(help));
    expect(out.split('\n')[0]).toBe(LESSONS_USAGE.add!.usage);
    expect(out).toContain(`Example:\n  ${LESSONS_USAGE.add!.example!}`);
    expect(out).not.toContain('Subcommands:');
  });
});
