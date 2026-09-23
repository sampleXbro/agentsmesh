import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { normalizeRecallFile } from '../../lessons/normalize-query-file.js';
import { matchLessons } from '../../lessons/lexical-retrieval.js';
import { collectAlwaysLessons } from '../../lessons/query.js';
import { rankLessons } from '../../lessons/ranking.js';
import { DEFAULT_ALWAYS_MAX_TOKENS, withinTokenBudget } from '../../lessons/recall-always.js';
import { recordRecallTelemetry } from '../../lessons/recall-telemetry.js';
import { loadRecallConfig, lessonsConfigWarning } from '../../lessons/recall-config.js';
import { capRulePayload, safeRuleLine } from '../../lessons/rule-line.js';
import {
  AUTO_SESSION_TTL_MS,
  autoSessionId,
  commitSeen,
  filterUnseen,
  openSessionDedup,
} from '../../lessons/seen-cache.js';
import {
  errorResult,
  numberFlag,
  parseFormat,
  queryFromFlags,
  stringFlag,
  type LessonsFlags,
} from './lessons-helpers.js';
import type { LessonsCommandResult, LessonsQueryData } from './lessons-types.js';
import {
  degradedRecallWarning,
  mergeWarnings,
  validateFormatFlag,
  validatePositiveIntFlag,
} from './lessons-query-guards.js';

/** Room for the `[id] ` and `NN. ` prefixes a printed line may carry. */
const LINE_PREFIX_CHARS = 8;

/** Leading rows that fit the printed-output cap applied by renderQuery. */
function fitPrintedPayload<T extends { readonly id: string; readonly rule: string }>(
  rows: readonly T[],
): T[] {
  return capRulePayload(rows, (r) => safeRuleLine(r.rule).length + r.id.length + LINE_PREFIX_CHARS)
    .kept;
}

export function doQuery(
  flags: LessonsFlags,
  projectRoot: string,
  autoMigrated: boolean,
): LessonsCommandResult {
  const topErr = validatePositiveIntFlag(flags, 'top');
  if (topErr !== null) return errorResult('query', topErr, 2);
  const maxTokErr = validatePositiveIntFlag(flags, 'max-tokens');
  if (maxTokErr !== null) return errorResult('query', maxTokErr, 2);
  const fmtErr = validateFormatFlag(flags);
  if (fmtErr !== null) return errorResult('query', fmtErr, 2);

  const format = parseFormat(flags);
  const raw = queryFromFlags(flags);
  // `--always` returns the universal always-on lessons and needs no predicate.
  const wantAlways = flags.always === true;
  // A recall must be anchored to something. Zero predicates is a no-op call —
  // fail loudly so an agent learns to pass the file/command it is about to touch.
  if (
    !wantAlways &&
    raw.file === undefined &&
    raw.command === undefined &&
    raw.keyword === undefined
  ) {
    return errorResult(
      'query',
      'Recall needs a predicate: pass at least one of --file <path-about-to-edit>, ' +
        '--cmd <command-about-to-run>, --keyword <text>, or --always.',
      2,
    );
  }
  // Keyword-only recall silently misses file_glob / command_pattern lessons (the
  // reliable majority). Allow it, but warn — it is the recall anti-pattern.
  const keywordOnlyWarning =
    raw.keyword !== undefined && raw.file === undefined && raw.command === undefined
      ? 'keyword-only recall misses file_glob and command_pattern lessons — pass ' +
        '--file <path-about-to-edit> and/or --cmd <command-about-to-run> for complete recall.'
      : undefined;
  // Normalize the file path so a project-relative glob matches regardless of the
  // shape the caller passed (absolute / ./-prefixed / backslash).
  const query =
    raw.file === undefined ? raw : { ...raw, file: normalizeRecallFile(raw.file, projectRoot) };
  // A present-but-broken config.json must not silently revert to defaults.
  const configWarning = lessonsConfigWarning(projectRoot) ?? undefined;
  const load = loadLessonsGraphResilient(projectRoot);
  if (load.status !== 'ok') {
    const warning = degradedRecallWarning(load, projectRoot, keywordOnlyWarning, configWarning);
    const data = { query, autoMigrated, lessons: [], totalMatches: 0, warning };
    return { subcommand: 'query', exitCode: 0, format, data };
  }
  const graph = load.graph;
  const { matches, lexicalCount } = matchLessons(graph, query);
  // Dedup before ranking so the caps fill with fresh lessons (see seen-cache).
  // `--session auto` derives a correlator (env id, else a TTL'd day key); every
  // session is project-namespaced so state never bleeds across repos.
  const sessionFlag = stringFlag(flags, 'session');
  const resolvedSession = sessionFlag === 'auto' ? autoSessionId() : (sessionFlag ?? undefined);
  const dedup = openSessionDedup({
    explicit: resolvedSession,
    disabled: flags['no-dedup'] === true,
    projectRoot,
    ...(sessionFlag === 'auto' ? { ttlMs: AUTO_SESSION_TTL_MS } : {}),
  });
  const forRank = dedup === null ? matches : filterUnseen(dedup, matches);
  // `--all` bypasses both caps; otherwise apply the per-project caps (which
  // default to the built-ins) so mandatory recall stays lean unless the caller
  // overrides via --top/--max-tokens.
  const cfg = loadRecallConfig(projectRoot);
  const limit = flags.all === true ? undefined : (numberFlag(flags, 'top') ?? cfg.limit);
  const maxTokens =
    flags.all === true ? undefined : (numberFlag(flags, 'max-tokens') ?? cfg.maxTokens);
  // `--always` prepends the always-on lessons, on the same budget as the hook and MCP.
  const alwaysLessons = wantAlways
    ? withinTokenBudget(
        collectAlwaysLessons(graph).map(({ id, lesson }) => ({
          id,
          rule: lesson.rule,
          topics: [...lesson.topics],
          triggers: [...lesson.triggers],
          evidence: [...lesson.evidence],
          score: undefined,
        })),
        DEFAULT_ALWAYS_MAX_TOKENS,
      )
    : [];
  const rankedAll = rankLessons(graph, query, forRank, { limit, maxTokens });
  // Plain and md output is size-capped; keep only what will be printed so
  // dedup never marks a cut rule as delivered. JSON is never cut.
  const printed =
    format === 'json'
      ? rankedAll.length
      : fitPrintedPayload([
          ...alwaysLessons,
          ...rankedAll.map(({ id, lesson }) => ({ id, rule: lesson.rule })),
        ]).length - alwaysLessons.length;
  const ranked = rankedAll.slice(0, Math.max(0, printed));
  if (dedup !== null)
    commitSeen(
      dedup,
      ranked.map(({ id }) => id),
    );
  // Record recall telemetry on the CLI path too (gated), so shell-driven `lessons
  // query` is visible to `lessons stats` — parity with the MCP tool, which records
  // via recallLessons. `--all` is a diagnostic dump, not mandatory recall: a bypass.
  recordRecallTelemetry(projectRoot, graph, query, matches, ranked, {
    bypassed: flags.all === true,
    lexical: lexicalCount,
    // Thread the resolved correlator so stats sees real sessions.
    session: dedup?.sessionId ?? resolvedSession,
  });
  const lessons = [
    ...alwaysLessons,
    ...ranked.map(({ id, lesson, score, reason }) => ({
      id,
      rule: lesson.rule,
      topics: [...lesson.topics],
      triggers: [...lesson.triggers],
      evidence: [...lesson.evidence],
      score,
      ...(reason.lexical === true ? { lexical: true as const } : {}),
    })),
  ];
  const suppressed = matches.length - forRank.length;
  const data: LessonsQueryData = {
    lessons,
    query,
    autoMigrated,
    totalMatches: matches.length,
    ...(suppressed > 0 ? { suppressed } : {}),
    ...(flags.ids === true ? { showIds: true } : {}),
    ...((): { warning?: string } => {
      const warning = mergeWarnings(keywordOnlyWarning, configWarning);
      return warning ? { warning } : {};
    })(),
  };
  return { subcommand: 'query', exitCode: 0, format, data };
}
