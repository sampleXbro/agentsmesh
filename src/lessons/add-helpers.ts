import { createHash } from 'node:crypto';
import type { AddLessonInput, AddLessonTriggers } from './add.js';
import type { Lesson, LessonsGraph, Trigger, TriggerKind } from './graph-schema.js';
import { projectRelativeGlob } from './trigger-file-glob.js';

export function normalizeRule(rule: string): string {
  return rule.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function union(base: readonly string[], extra: readonly string[]): string[] {
  const out = [...base];
  for (const item of extra) if (!out.includes(item)) out.push(item);
  return out;
}

/**
 * Fold a re-captured rule into its existing lesson: union topics, triggers and
 * evidence; the first rationale wins; `--scope always` promotes it to always-on.
 */
export function upsertLesson(
  before: Lesson,
  input: AddLessonInput,
  triggerIds: readonly string[],
): Lesson {
  return {
    ...before,
    topics: union(before.topics, [input.topic]),
    triggers: union(before.triggers, triggerIds),
    evidence: union(before.evidence, input.evidence ?? []),
    ...(before.rationale === undefined && input.rationale !== undefined
      ? { rationale: input.rationale }
      : {}),
    ...(input.scope === 'always' ? { scope: 'always' as const } : {}),
  };
}

/** What an upsert changed, in a fixed order; empty when the re-add was a no-op. */
export function describeUpsert(before: Lesson, after: Lesson): string[] {
  const added = (base: readonly string[], next: readonly string[]): string[] =>
    next.filter((item) => !base.includes(item));
  const topics = added(before.topics, after.topics);
  const triggers = added(before.triggers, after.triggers);
  const evidence = added(before.evidence, after.evidence);
  const changes: string[] = [];
  if (after.scope === 'always' && before.scope !== 'always') changes.push('scope set to always');
  if (topics.length > 0) changes.push(`topic added: ${topics.join(', ')}`);
  if (triggers.length > 0) {
    changes.push(`trigger${triggers.length === 1 ? '' : 's'} attached: ${triggers.join(', ')}`);
  }
  if (evidence.length > 0) changes.push(`evidence added: ${evidence.join(', ')}`);
  if (before.rationale === undefined && after.rationale !== undefined) {
    changes.push('rationale added');
  }
  return changes;
}

/**
 * Find an ACTIVE lesson with the same normalized rule. Inactive
 * (deprecated/superseded) lessons are ignored on purpose: re-capturing a rule
 * whose only match is dead must produce a fresh ACTIVE lesson (a live
 * replacement), not silently enrich a corpse that recall will never surface.
 */
export function findExistingLessonByRule(graph: LessonsGraph, ruleKey: string): string | null {
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    if (normalizeRule(lesson.rule) === ruleKey) return id;
  }
  return null;
}

interface TriggerSpec {
  readonly kind: TriggerKind;
  readonly pattern: string;
}

/**
 * Resolve/create trigger nodes for the requested patterns; returns referenced +
 * newly-created ids. With `projectRoot`, an absolute file glob inside the
 * project is made relative and one outside it throws TriggerFileGlobError.
 */
export function mergeTriggers(
  graph: LessonsGraph,
  spec: AddLessonTriggers,
  projectRoot?: string,
): { triggerIds: string[]; newTriggerIds: string[] } {
  const requested: TriggerSpec[] = [
    // Recall matches forward-slash, project-relative paths (normalizeRecallFile),
    // so a backslash or absolute pattern stored raw would silently never fire.
    // Normalizing here also dedupes it against the node it equals.
    ...(spec.files ?? []).map(
      (p): TriggerSpec => ({
        kind: 'file_glob',
        pattern:
          projectRoot === undefined ? p.replaceAll('\\', '/') : projectRelativeGlob(p, projectRoot),
      }),
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
