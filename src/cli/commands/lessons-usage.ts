/**
 * Per-subcommand usage signatures and worked examples for `agentsmesh lessons`.
 *
 * Single source of truth for the whole subcommand surface. Three help renderers
 * read from here, so they can never drift apart:
 *  - the combined overview (`printHelp` in renderers/lessons.ts) lists one line
 *    per subcommand, derived from each `usage` signature plus its `summary`;
 *  - the focused `lessons <sub> --help` view (`printCommandHelp`) shows the
 *    signature + worked example;
 *  - the add-handler error hints reuse the `add` entry.
 * A fresh agent that mis-calls a subcommand should land on the exact correct
 * shape in one shot rather than re-deriving it from the combined flag wall.
 */
export interface LessonsSubcommandUsage {
  /** One-line signature, brackets for optional, `...` for repeatable flags. */
  readonly usage: string;
  /** A filled-in, copy-pasteable invocation. Omitted for no-argument commands. */
  readonly example?: string;
  /** Short parenthetical shown after the signature in the combined overview. */
  readonly summary?: string;
}

export const LESSONS_USAGE: Record<string, LessonsSubcommandUsage> = {
  query: {
    usage:
      'agentsmesh lessons query [--file <path>] [--cmd <command>] [--keyword <text>] [--always] [--format plain|md|json] [--top <n>] [--all] [--max-tokens <n>] [--session <id>|auto] [--no-dedup] [--ids]',
    example: 'agentsmesh lessons query --file src/app/page.tsx --cmd "git commit -m wip"',
  },
  add: {
    usage:
      'agentsmesh lessons add "<rule>" --topic <id> [--trigger-file <glob>]... [--trigger-cmd <regex>]... [--trigger-kw <text>]... [--evidence <ref>]... [--rationale <text>] [--new-topic --topic-summary "..."] [--scope always]',
    example:
      'agentsmesh lessons add "Run tsc --noEmit before committing type changes" --topic build --trigger-file "src/**/*.ts" --evidence commit:abc1234',
  },
  topics: {
    usage: 'agentsmesh lessons topics',
  },
  show: {
    usage: 'agentsmesh lessons show <topic|lesson-id>',
    example: 'agentsmesh lessons show build',
    summary: 'a topic, or one lesson by id with its triggers resolved',
  },
  deprecate: {
    usage: 'agentsmesh lessons deprecate <id> [--superseded-by <id>]',
    example: 'agentsmesh lessons deprecate build-old-rule --superseded-by build-new-rule',
  },
  merge: {
    usage: 'agentsmesh lessons merge <loser-id> <keeper-id>',
    example: 'agentsmesh lessons merge build-duplicate build-canonical',
  },
  untrigger: {
    usage: 'agentsmesh lessons untrigger <lesson-id> <trigger-id>',
    example: 'agentsmesh lessons untrigger build-old-rule t-kw-8bdcf7aa',
    summary: 'detach a trigger; GCs it if now unused',
  },
  'strip-markers': {
    usage: 'agentsmesh lessons strip-markers [--dry-run]',
    example: 'agentsmesh lessons strip-markers --dry-run',
  },
  journal: {
    usage: 'agentsmesh lessons journal',
  },
  validate: {
    usage: 'agentsmesh lessons validate',
  },
  resolve: {
    usage: 'agentsmesh lessons resolve',
    summary: 'union both sides of a git merge conflict in lessons.json',
  },
  stats: {
    usage: 'agentsmesh lessons stats [--json]',
    summary: 'recall telemetry summary; needs AGENTSMESH_LESSONS_TELEMETRY=1',
  },
  prune: {
    usage: 'agentsmesh lessons prune [--apply] [--cap <n>]',
    example: 'agentsmesh lessons prune --apply',
    summary: 'dry-run by default; trims over-cap lessons + dead triggers',
  },
  'import-md': {
    usage: 'agentsmesh lessons import-md [--merge] [--force] [--migrated-at <ISO date>]',
    example: 'agentsmesh lessons import-md --merge',
  },
};

/**
 * Canonical, ordered list of every `agentsmesh lessons` subcommand — derived
 * from {@link LESSONS_USAGE} so the two cannot diverge. Help surfaces enumerate
 * from this; a dispatcher-parity test ties it to the real routing in
 * `runLessons`.
 */
export const LESSONS_SUBCOMMANDS: readonly string[] = Object.keys(LESSONS_USAGE);

/** Multi-line usage + example hint appended to add-handler errors. */
export function lessonsAddHint(): string {
  const add = LESSONS_USAGE.add!;
  return `\nUsage: ${add.usage}\nExample: ${add.example}`;
}
