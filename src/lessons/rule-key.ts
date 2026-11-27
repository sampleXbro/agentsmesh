/**
 * The key an incoming capture is matched to an existing lesson on. It is wider
 * than `normalizeRule` (case + spacing): it also ignores trailing sentence
 * punctuation and wrapping quotes, so "Prefer X." and `"prefer x"` are one rule.
 *
 * `normalizeRule` stays the key for DUPLICATE_RULE and the 3-way merge: widening
 * it would turn punctuation variants already stored in a graph into lint errors
 * and hide a punctuation-only edit from `merge`.
 */

const TRAILING_PUNCTUATION = /[.!;:]+$/u;
const STRAIGHT_QUOTES = new Set(['"', "'", '`']);
const CURLY_PAIRS: ReadonlyMap<string, string> = new Map([
  ['“', '”'],
  ['‘', '’'],
]);

/** The text inside a quote pair that wraps the whole rule, else the rule itself. */
function unwrapQuotes(text: string): string {
  const first = text[0];
  const last = text.at(-1);
  if (first === undefined || last === undefined || text.length < 2) return text;
  const inner = text.slice(1, -1);
  const straight = STRAIGHT_QUOTES.has(first) && last === first && !inner.includes(first);
  const close = CURLY_PAIRS.get(first);
  const curly =
    close !== undefined && last === close && !inner.includes(first) && !inner.includes(close);
  return straight || curly ? inner.trim() : text;
}

/** `normalizedRule` (see `normalizeRule`) without trailing `.!;:` and wrapping quotes. */
export function looseRuleKey(normalizedRule: string): string {
  let key = normalizedRule;
  for (;;) {
    const next = unwrapQuotes(key.replace(TRAILING_PUNCTUATION, '').trimEnd());
    if (next === key) break;
    key = next;
  }
  return key === '' ? normalizedRule : key;
}
