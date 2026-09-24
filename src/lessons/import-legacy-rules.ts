/**
 * Rules in a legacy topic file (up to 0.22): list items under a `## Rules` or
 * `## Lessons` heading. A numbered or bullet item keeps the lines that wrap
 * onto it, and an `(Evidence L1, L2)` tail becomes evidence. A list item under
 * any other heading is not guessed at: its line is reported so the migration
 * stops with nothing changed (#138).
 */

export interface ParsedRule {
  /** 1-based position among the file's rules; unique even when numbers repeat. */
  readonly index: number;
  readonly body: string;
  readonly evidence: string[];
}

export interface ParsedTopic {
  readonly rules: ParsedRule[];
  /** 1-based line of the first list item outside a rules section, or null. */
  readonly strayLine: number | null;
}

const HEADING = /^#{1,6}\s/;
const SECTION_HEADING = /^#{1,2}\s/;
const RULES_HEADING = /^##\s+(?:Rules|Lessons)\b/i;
const ITEM = /^\s{0,3}(?:\d+[.)]|[-*+])\s+(.+?)\s*$/;
const EVIDENCE_TAIL = /\s*\(Evidence:?\s+([^)]+)\)\s*$/;
const EVIDENCE_REF = /L\d+/g;

function withEvidence(index: number, text: string): ParsedRule {
  let body = text;
  const evidence: string[] = [];
  let tail = EVIDENCE_TAIL.exec(body);
  while (tail !== null) {
    evidence.unshift(...(tail[1]!.match(EVIDENCE_REF) ?? []));
    body = body.slice(0, tail.index).trimEnd();
    tail = EVIDENCE_TAIL.exec(body);
  }
  return { index, body, evidence };
}

export function parseRulesSection(markdown: string): ParsedTopic {
  const items: string[] = [];
  let inRules = false;
  // The previous line was part of an item, so a plain next line wraps onto it.
  let open = false;
  let strayLine: number | null = null;
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (HEADING.test(line)) {
      if (SECTION_HEADING.test(line)) inRules = RULES_HEADING.test(line);
      open = false;
      return;
    }
    const item = ITEM.exec(line);
    if (item !== null) {
      if (inRules) items.push(item[1]!);
      else strayLine ??= i + 1;
      open = inRules;
      return;
    }
    if (line.trim() === '') open = false;
    else if (open) items[items.length - 1] += ` ${line.trim()}`;
  });
  return { rules: items.map((text, i) => withEvidence(i + 1, text)), strayLine };
}
