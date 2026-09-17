import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { LessonsGraphSchema } from '../../../src/lessons/graph-schema.js';
import type { NamedRecurrenceSuite, RecurrenceSuite } from './types.js';

const QuerySchema = z
  .object({
    file: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    keyword: z.string().min(1).optional(),
  })
  .strict()
  .refine((q) => q.file !== undefined || q.command !== undefined || q.keyword !== undefined, {
    message: 'case query must set at least one of file, command, or keyword',
  });

const CaseSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1).optional(),
    query: QuerySchema,
    topN: z.number().int().positive().optional(),
    shouldRetrieve: z.array(z.string().min(1)),
    shouldNotRetrieve: z.array(z.string().min(1)),
  })
  .strict();

const SuiteSchema = z
  .object({
    topN: z.number().int().positive(),
    graph: LessonsGraphSchema,
    cases: z.array(CaseSchema).min(1),
  })
  .strict();

type ParsedSuite = z.infer<typeof SuiteSchema>;

/**
 * Enforce the invariants that make bidirectional precision/recall well-defined:
 *  - case ids are unique,
 *  - every labeled id exists in the graph; every expected id is ACTIVE,
 *  - shouldRetrieve / shouldNotRetrieve are disjoint,
 *  - every case labels EVERY lesson (expected XOR forbidden), so no lesson is
 *    unlabeled and the false-positive direction is always measured.
 */
function validateInvariants(suite: ParsedSuite): void {
  const lessonIds = new Set(Object.keys(suite.graph.lessons));
  const activeIds = new Set(
    Object.entries(suite.graph.lessons)
      .filter(([, l]) => l.status === 'active')
      .map(([id]) => id),
  );
  const seenCaseIds = new Set<string>();
  for (const c of suite.cases) {
    if (seenCaseIds.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
    seenCaseIds.add(c.id);
    const forbidden = new Set(c.shouldNotRetrieve);
    for (const id of c.shouldRetrieve) {
      if (!lessonIds.has(id)) throw new Error(`case ${c.id}: shouldRetrieve unknown lesson ${id}`);
      if (!activeIds.has(id))
        throw new Error(`case ${c.id}: shouldRetrieve non-active lesson ${id}`);
      if (forbidden.has(id)) {
        throw new Error(`case ${c.id}: ${id} in both shouldRetrieve and shouldNotRetrieve`);
      }
    }
    for (const id of c.shouldNotRetrieve) {
      if (!lessonIds.has(id))
        throw new Error(`case ${c.id}: shouldNotRetrieve unknown lesson ${id}`);
    }
    const labeled = new Set([...c.shouldRetrieve, ...c.shouldNotRetrieve]).size;
    if (labeled !== lessonIds.size) {
      throw new Error(`case ${c.id}: must label every lesson (${labeled}/${lessonIds.size})`);
    }
  }
}

/**
 * Parse and validate a recurrence suite. The graph is validated for SHAPE only
 * (`LessonsGraphSchema`) — never run through the graph-quality validator, so the
 * harness measures retrieval discriminability, not graph hygiene.
 */
export function parseSuite(raw: unknown): RecurrenceSuite {
  const parsed = SuiteSchema.parse(raw);
  validateInvariants(parsed);
  return parsed;
}

/** Load and validate a recurrence suite from a JSON file. */
export function loadSuite(path: string): RecurrenceSuite {
  return parseSuite(JSON.parse(readFileSync(path, 'utf8')));
}

const NamedSuiteSchema = z
  .object({
    name: z.string().min(1),
    topN: z.number().int().positive(),
    graph: LessonsGraphSchema,
    cases: z.array(CaseSchema).min(1),
  })
  .strict();

const SuitesFileSchema = z.object({ suites: z.array(NamedSuiteSchema).min(1) }).strict();

/**
 * Parse and validate a multi-suite fixture (each suite isolates one ranker
 * mechanism with its own minimal graph). Suite names must be unique, and every
 * suite's cases obey the same invariants as a single suite.
 */
export function parseSuites(raw: unknown): NamedRecurrenceSuite[] {
  const parsed = SuitesFileSchema.parse(raw);
  const seen = new Set<string>();
  for (const suite of parsed.suites) {
    if (seen.has(suite.name)) throw new Error(`duplicate suite name: ${suite.name}`);
    seen.add(suite.name);
    validateInvariants(suite);
  }
  return parsed.suites;
}

/** Load and validate a multi-suite fixture from a JSON file. */
export function loadSuites(path: string): NamedRecurrenceSuite[] {
  return parseSuites(JSON.parse(readFileSync(path, 'utf8')));
}
