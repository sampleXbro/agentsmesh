/**
 * Effectiveness with a denominator.
 *
 * `lessons stats` reports a held-rate and correctly calls it a weak upper
 * bound: a delivery with no recorded repeat is not proof of prevention. The
 * missing piece was exposure — how many times an action happened, not just how
 * many times it failed. The recall log now carries the action key, so
 * occurrences are countable and a rate is too.
 *
 * This is still observational. Lessons are delivered for actions that already
 * had trouble, so regression to the mean pushes the "after" rate down on its
 * own. Treat the output as a signal worth an experiment, never as the claim.
 * The honest version needs a randomized arm with recall disabled.
 *
 *   node_modules/.bin/tsx scripts/lessons-effectiveness.mts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lessonsPaths } from '../src/lessons/paths.js';

interface Recall {
  ts: string;
  contextKey?: string;
}
interface Outcome {
  ts: string;
  kind: string;
  contextKey: string;
}

const root = process.cwd();
const base = lessonsPaths(root).base;

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

const recalls = readJsonl<Recall>(join(base, 'recall-log.jsonl'));
const outcomes = readJsonl<Outcome>(join(base, 'outcome-log.jsonl'));

const keyed = recalls.filter((r) => typeof r.contextKey === 'string' && r.contextKey !== 'none');
const legacy = recalls.length - keyed.length;

console.log(`recall records      : ${recalls.length} (${legacy} without an action key)`);
console.log(`outcome records     : ${outcomes.length}`);
if (keyed.length === 0) {
  console.log('\nNo keyed occurrences yet. The denominator starts accumulating from the');
  console.log('next recall; re-run once a few sessions have passed.');
  process.exit(0);
}

/** Occurrences, deliveries and failures per action, in time order. */
const occ = new Map<string, string[]>();
for (const r of keyed) occ.set(r.contextKey!, [...(occ.get(r.contextKey!) ?? []), r.ts]);

const firstDelivery = new Map<string, string>();
const failures = new Map<string, string[]>();
for (const o of outcomes.sort((a, b) => (a.ts < b.ts ? -1 : 1))) {
  if (o.kind === 'delivered' && !firstDelivery.has(o.contextKey))
    firstDelivery.set(o.contextKey, o.ts);
  if (o.kind === 'failure') failures.set(o.contextKey, [...(failures.get(o.contextKey) ?? []), o.ts]);
}

let occBefore = 0;
let occAfter = 0;
let failBefore = 0;
let failAfter = 0;
let keysCounted = 0;

for (const [key, stamps] of occ) {
  const first = firstDelivery.get(key);
  if (first === undefined) continue; // untreated: no delivery, nothing to compare
  keysCounted += 1;
  for (const ts of stamps) (ts < first ? occBefore++ : occAfter++);
  for (const ts of failures.get(key) ?? []) (ts < first ? failBefore++ : failAfter++);
}

const rate = (f: number, o: number): string => (o === 0 ? 'n/a' : (f / o).toFixed(4));
console.log(`\nactions with a delivery : ${keysCounted}`);
console.log(`  before  occurrences=${occBefore}  failures=${failBefore}  rate=${rate(failBefore, occBefore)}`);
console.log(`  after   occurrences=${occAfter}  failures=${failAfter}  rate=${rate(failAfter, occAfter)}`);

if (occBefore === 0) {
  console.log('\nNo pre-delivery exposure recorded yet — a lesson usually delivers on the');
  console.log('first touch of an action, so the "before" window only fills for actions');
  console.log('seen before their lesson existed. This needs time, or the A/B arm.');
}
console.log('\nObservational. Not evidence of prevention. See the header.');
