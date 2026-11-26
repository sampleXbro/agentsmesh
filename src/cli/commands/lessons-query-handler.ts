import { currentGraphStamp } from '../../lessons/cmd-fastpath.js';
import { loadLessonsGraphResilient } from '../../lessons/graph-store.js';
import { normalizeRecallFile } from '../../lessons/normalize-query-file.js';
import { selectAlwaysLessons } from '../../lessons/recall-always.js';
import { lessonsConfigWarning } from '../../lessons/recall-config.js';
import { recallFromGraph } from '../../lessons/recall-core.js';
import { AUTO_SESSION_TTL_MS, autoSessionId } from '../../lessons/seen-cache.js';
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
import { fitPrintedPayload, lessonRow, rankedRow } from './lessons-query-rows.js';

export function doQuery(
  flags: LessonsFlags,
  projectRoot: string,
  autoMigrated: boolean,
  migrationError?: string,
  cwd: string = process.cwd(),
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
  // shape the caller passed (absolute / ./-prefixed / backslash). A relative path
  // typed in a sub folder is read from there (`cwd`).
  const query =
    raw.file === undefined
      ? raw
      : { ...raw, file: normalizeRecallFile(raw.file, projectRoot, cwd) };
  // A present-but-broken config.json must not silently revert to defaults.
  const configWarning = lessonsConfigWarning(projectRoot) ?? undefined;
  // Stamp BEFORE the read, as recallLessons does (see cmd-fastpath.ts).
  const preReadStamp = currentGraphStamp(projectRoot);
  const load = loadLessonsGraphResilient(projectRoot);
  if (load.status !== 'ok') {
    const warning = degradedRecallWarning(load, projectRoot, keywordOnlyWarning, configWarning, {
      migrationError,
    });
    const data = { query, autoMigrated, lessons: [], totalMatches: 0, warning };
    return { subcommand: 'query', exitCode: 0, format, data };
  }
  const graph = load.graph;
  // `--session auto` derives a correlator (env id, else a TTL'd day key); every
  // session is project-namespaced so state never bleeds across repos.
  const sessionFlag = stringFlag(flags, 'session');
  const session = {
    sessionId: sessionFlag === 'auto' ? autoSessionId() : (sessionFlag ?? undefined),
    noDedup: flags['no-dedup'] === true,
    ...(sessionFlag === 'auto' ? { ttlMs: AUTO_SESSION_TTL_MS } : {}),
  };
  // `--always` prepends the always-on lessons, deduped and on the same budget as
  // the hook and MCP.
  const always = wantAlways ? selectAlwaysLessons(projectRoot, graph, session) : null;
  const alwaysRows = (always?.lessons ?? []).map(({ id, lesson }) => lessonRow(id, lesson));
  const top = numberFlag(flags, 'top');
  const maxTokens = numberFlag(flags, 'max-tokens');
  // The same pipeline as MCP and the hook (ranking, effectiveness, dedup,
  // telemetry). `--all` bypasses both caps; otherwise the per-project caps apply
  // unless --top/--max-tokens override. Plain and md output is size-capped, so
  // trim to what is printed before dedup commits; JSON is never cut.
  const recall = recallFromGraph(
    projectRoot,
    graph,
    query,
    {
      ...session,
      all: flags.all === true,
      ...(top === null ? {} : { limit: top }),
      ...(maxTokens === null ? {} : { maxTokens }),
      ...(format === 'json' ? {} : { trim: fitPrintedPayload(alwaysRows) }),
    },
    preReadStamp,
  );
  const suppressed = recall.suppressed + (always?.suppressed ?? 0);
  const data: LessonsQueryData = {
    lessons: [...alwaysRows, ...recall.lessons.map(rankedRow)],
    query,
    autoMigrated,
    totalMatches: recall.totalMatches,
    ...(suppressed > 0 ? { suppressed } : {}),
    ...(flags.ids === true ? { showIds: true } : {}),
    ...((): { warning?: string } => {
      const warning = mergeWarnings(keywordOnlyWarning, configWarning);
      return warning ? { warning } : {};
    })(),
  };
  return { subcommand: 'query', exitCode: 0, format, data };
}
