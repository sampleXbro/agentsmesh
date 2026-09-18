/**
 * Command merging for the Anthropic skill-pack aggregator.
 *
 * Walks every command directory declared in the descriptor in precedence
 * order (lowest precedence wins on `name` collision) and produces a merged
 * command list plus a `CommandDedup` record per conflict. The explicit root
 * `commands/` directory is included as `precedence: 0`, so it always wins
 * over per-tool directories such as `.claude/commands/`.
 *
 * Every spec — canonical root `commands/` and per-tool dirs alike — routes
 * through `readCommandsDirWithMappers`. Per-tool dirs restrict to that
 * tool's mapper (`.gemini/commands/` → `gemini-cli`); the canonical root
 * (`spec.target` unset) tries every registered target's non-`.md` mapper
 * so stray cross-format commands are picked up too. Single source of
 * truth for "how to read X's commands" lives in each target descriptor;
 * this aggregator just decides scope.
 */

import { join } from 'node:path';
import { readEntityDirWithMappers } from '../../install/importers/target-native-commands.js';
import type { ParseFrontmatterOptions } from '../../canonical/features/rules.js';
import type { CanonicalCommand } from '../../core/types.js';
import type { CommandDedup, CommandMergeSpec } from './aggregate.js';

interface MergedCommand {
  readonly command: CanonicalCommand;
  readonly precedence: number;
}

export interface MergedCommandsResult {
  readonly commands: readonly CanonicalCommand[];
  readonly dedups: readonly CommandDedup[];
  /**
   * Removes any temp staging directories created by per-target command
   * importers. Always safe to call (no-op when nothing was staged). The
   * install pipeline invokes it via `prep.cleanup()` after pack materialization.
   */
  readonly cleanup: () => Promise<void>;
}

/**
 * Command directories merged in addition to canonical `commands/`. Root
 * `commands/` wins over both per-tool directories, and `.claude` wins over
 * `.gemini` on a same-name conflict (C1 contract).
 */
export const MERGE_FROM_TOOL_DIRS: readonly CommandMergeSpec[] = [
  { dir: 'commands', precedence: 0 },
  { dir: '.claude/commands', target: 'claude-code', precedence: 1 },
  { dir: '.gemini/commands', target: 'gemini-cli', precedence: 2 },
];

export async function mergeCommands(
  contentRoot: string,
  specs: readonly CommandMergeSpec[],
  parseOpts: ParseFrontmatterOptions = {},
): Promise<MergedCommandsResult> {
  const winners = new Map<string, MergedCommand>();
  const losers = new Map<string, Array<{ path: string; precedence: number }>>();
  const cleanups: Array<() => Promise<void>> = [];

  const ordered = [...specs].sort((a, b) => a.precedence - b.precedence);
  for (const spec of ordered) {
    // Per-tool dirs (`.gemini/commands/`) restrict to that target's mapper
    // to keep the canonical-source-path invariant for known dirs; the
    // canonical root (`spec.target` unset) tries every registered target's
    // non-`.md` mapper so cross-format files (e.g. a stray `.toml` in
    // `commands/`) install instead of being silently dropped.
    const { entities: commands, cleanup } = await readEntityDirWithMappers(
      join(contentRoot, spec.dir),
      'commands',
      {
        restrictToTarget: spec.target,
        parseOpts,
      },
    );
    cleanups.push(cleanup);
    for (const cmd of commands) {
      const existing = winners.get(cmd.name);
      if (existing === undefined) {
        winners.set(cmd.name, { command: cmd, precedence: spec.precedence });
        continue;
      }
      const list = losers.get(cmd.name) ?? [];
      list.push({ path: cmd.source, precedence: spec.precedence });
      losers.set(cmd.name, list);
    }
  }

  const dedups: CommandDedup[] = [];
  for (const [name, loserList] of losers) {
    const winner = winners.get(name);
    // Invariant: `losers` is only populated when a `winners` entry already
    // exists for the same name. A missing winner here means the invariant has
    // been broken by a refactor — fail loudly rather than hide the bug.
    if (winner === undefined) {
      throw new Error(`mergeCommands invariant: loser without winner for "${name}"`);
    }
    // `loserList` was filled by iterating `ordered` (sorted ascending by
    // precedence at line 32), so it is already in precedence order.
    dedups.push({
      basename: name,
      winnerPath: winner.command.source,
      loserPaths: loserList.map((l) => l.path),
    });
  }
  dedups.sort((a, b) => a.basename.localeCompare(b.basename));

  const mergedCommands = [...winners.values()]
    .map((w) => w.command)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cleanup = async (): Promise<void> => {
    // Run every staged-dir cleanup, swallowing per-step errors so one
    // mid-batch failure can't strand the others. Cleanup is best-effort
    // by design — tmpdir reapers will catch anything we miss.
    await Promise.allSettled(cleanups.map((fn) => fn()));
  };

  return { commands: mergedCommands, dedups, cleanup };
}
