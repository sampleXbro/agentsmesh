import { createHash } from 'node:crypto';
import type { AddLessonTriggers } from './add.js';
import type { LessonsGraph, Trigger, TriggerKind } from './graph-schema.js';

export function normalizeRule(rule: string): string {
  return rule.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function union(base: readonly string[], extra: readonly string[]): string[] {
  const out = [...base];
  for (const item of extra) if (!out.includes(item)) out.push(item);
  return out;
}

interface TriggerSpec {
  readonly kind: TriggerKind;
  readonly pattern: string;
}

/** Resolve/create trigger nodes for the requested patterns; returns referenced + newly-created ids. */
export function mergeTriggers(
  graph: LessonsGraph,
  spec: AddLessonTriggers,
): { triggerIds: string[]; newTriggerIds: string[] } {
  const requested: TriggerSpec[] = [
    // Normalize `\` → `/` so a Windows-shaped glob matches: recall relativizes
    // every `--file` to forward slashes (normalizeRecallFile), so a backslash
    // pattern stored raw would silently never fire. Normalizing here also lets
    // a backslash pattern dedupe against the forward-slash node it equals.
    ...(spec.files ?? []).map(
      (p): TriggerSpec => ({ kind: 'file_glob', pattern: p.replaceAll('\\', '/') }),
    ),
    ...(spec.commands ?? []).map((p): TriggerSpec => ({ kind: 'command_pattern', pattern: p })),
    ...(spec.keywords ?? []).map((p): TriggerSpec => ({ kind: 'keyword', pattern: p })),
  ];

  const reverseLookup = new Map<string, string>();
  for (const [id, trigger] of Object.entries(graph.triggers)) {
    reverseLookup.set(triggerKey(trigger), id);
  }

  const triggerIds: string[] = [];
  const newTriggerIds: string[] = [];
  for (const spec of requested) {
    const key = triggerKey(spec);
    const existing = reverseLookup.get(key);
    if (existing !== undefined) {
      if (!triggerIds.includes(existing)) triggerIds.push(existing);
      continue;
    }
    const id = makeTriggerId(spec);
    graph.triggers[id] = { kind: spec.kind, pattern: spec.pattern };
    reverseLookup.set(key, id);
    triggerIds.push(id);
    newTriggerIds.push(id);
  }
  return { triggerIds, newTriggerIds };
}

function triggerKey(t: TriggerSpec | Trigger): string {
  return `${t.kind}|${t.pattern}`;
}

const TRIGGER_PREFIX: Record<TriggerKind, string> = {
  file_glob: 'glob',
  command_pattern: 'cmd',
  keyword: 'kw',
};

function makeTriggerId(spec: TriggerSpec): string {
  const hash = createHash('sha1').update(triggerKey(spec)).digest('hex').slice(0, 8);
  return `t-${TRIGGER_PREFIX[spec.kind]}-${hash}`;
}

export function makeLessonId(graph: LessonsGraph, topic: string, ruleKey: string): string {
  const slug = ruleToSlug(ruleKey);
  const base =
    slug.length > 0
      ? `${topic}-${slug}`
      : `${topic}-${createHash('sha1').update(ruleKey).digest('hex').slice(0, 8)}`;
  let candidate = base;
  let i = 2;
  while (graph.lessons[candidate] !== undefined) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
}

function ruleToSlug(rule: string): string {
  const words = rule
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 5);
  return words.join('-').slice(0, 40).replace(/-+$/, '');
}

/** UTC `YYYY-MM-DD`. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
