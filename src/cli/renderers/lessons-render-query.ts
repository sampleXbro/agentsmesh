/**
 * Renderer for `agentsmesh lessons query`. Plain/md output goes to stdout
 * (paste-clean, one rule per line); every notice — truncation, dedup — goes to
 * stderr so an agent pasting stdout into its context never picks up chatter.
 */
import { capRulePayload, MAX_RECALL_PAYLOAD_CHARS, safeRuleLine } from '../../lessons/rule-line.js';
import { logger } from '../../utils/output/logger.js';
import type { LessonsQueryData, LessonsQueryFormat } from '../commands/lessons-types.js';

export function renderQuery(data: LessonsQueryData, format: LessonsQueryFormat): void {
  if (data.autoMigrated) {
    logger.warn('lessons.json was auto-migrated from index.yaml on first invocation.');
  }
  if (data.warning !== undefined && data.warning.length > 0) {
    logger.warn(data.warning);
  }
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  const suppressed = data.suppressed ?? 0;
  if (data.lessons.length === 0) {
    // A fully-deduped recall is not "no matches" — say what was hidden.
    logger.info(
      suppressed > 0
        ? `(no new matches: ${suppressed} already shown this session)`
        : '(no matches)',
    );
    renderSuppressed(suppressed);
    return;
  }
  // `--ids` prefixes each line with the lesson id so an irrelevant recall can be
  // traced to `show <id>` / `deprecate <id>`. Off by default to keep the plain
  // output paste-clean and token-lean. The graph may come from a cloned repo, so
  // each rule is one clamped line and the whole answer is size-capped.
  const withId = (id: string, rule: string): string =>
    data.showIds === true ? `[${safeRuleLine(id, 200)}] ${rule}` : rule;
  const lines = data.lessons.map((l, i) => {
    const line = withId(l.id, safeRuleLine(l.rule));
    return format === 'md' ? `${i + 1}. ${line}` : line;
  });
  const { kept, dropped } = capRulePayload(lines, (line) => line.length);
  for (const line of kept) logger.info(line);
  if (dropped > 0) {
    logger.warn(
      `(${dropped} more rules not shown: output is capped at ${MAX_RECALL_PAYLOAD_CHARS} characters — pass --json for the full list)`,
    );
  }
  // A wording match has no trigger behind it; say so (stderr) so a surprising rule
  // can be traced to lexical retrieval rather than mistaken for a trigger hit.
  const byWording = data.lessons.filter((l) => l.lexical === true).length;
  if (byWording > 0) {
    logger.warn(`(${byWording} recalled by wording rather than a trigger — see --json)`);
  }
  // Never silently truncate: tell the user (on stderr, keeping stdout paste-clean)
  // when the ranked cap hid matches.
  if (data.totalMatches !== undefined && data.totalMatches > data.lessons.length) {
    // `--top` alone still hits the token budget, so name both knobs (or --all).
    logger.warn(
      `(showing ${data.lessons.length} of ${data.totalMatches} matches — raise --top <n> with --max-tokens <m>, or pass --all; output is capped at ${MAX_RECALL_PAYLOAD_CHARS} characters, --format json is not)`,
    );
  }
  renderSuppressed(suppressed);
}

/**
 * Dedup is opt-in via a session id; note when repeats were hidden so the
 * suppression is never silent (stderr, keeping stdout paste-clean).
 */
function renderSuppressed(suppressed: number): void {
  if (suppressed > 0) {
    logger.warn(`(${suppressed} already shown this session — deduped; pass --no-dedup to include)`);
  }
}
