/**
 * Delivery simulation for lessons-graph curation.
 *
 * Consolidating a graph can make a cluster undeliverable on its own anchor
 * files, so every change is gated on a before/after diff of what recall
 * actually delivers for a representative set of anchors.
 */
import { writeFileSync } from 'node:fs';
import { recallLessons } from '../src/lessons/recall.js';

const ANCHORS: Array<{ label: string; query: Record<string, string> }> = [
  { label: 'src/targets/import/*', query: { file: 'src/targets/import/import-metadata-core.ts' } },
  { label: 'src/lessons/hook', query: { file: 'src/lessons/hook.ts' } },
  { label: 'src/cli/commands/init', query: { file: 'src/cli/commands/init.ts' } },
  { label: 'src/core/reference', query: { file: 'src/core/reference/link-rebaser.ts' } },
  { label: 'src/targets/cursor', query: { file: 'src/targets/cursor/generator.ts' } },
  { label: 'unit test file', query: { file: 'tests/unit/lessons/recall.test.ts' } },
  { label: 'e2e test file', query: { file: 'tests/e2e/import.e2e.test.ts' } },
  { label: 'README', query: { file: 'README.md' } },
  { label: 'a SKILL.md', query: { file: '.agentsmesh/skills/lessons/SKILL.md' } },
  { label: 'website mdx', query: { file: 'website/src/content/docs/cli/init.mdx' } },
  { label: 'cmd: generate', query: { command: 'agentsmesh generate' } },
  { label: 'cmd: vitest', query: { command: 'node_modules/.bin/vitest run' } },
  { label: 'cmd: git commit', query: { command: 'git commit -m wip' } },
];

const root = process.cwd();
const out: Record<string, { total: number; delivered: string[] }> = {};
for (const a of ANCHORS) {
  const r = await recallLessons(root, a.query, { limit: 5, sessionId: undefined });
  out[a.label] = { total: r.totalMatches, delivered: r.lessons.map((l) => l.id) };
}
const target = process.argv[2] ?? 'before';
writeFileSync(`/tmp/lessons-sim-${target}.json`, JSON.stringify(out, null, 1));
const totals = Object.values(out).map((v) => v.total);
console.log(`${target}: anchors=${ANCHORS.length}  totalMatches sum=${totals.reduce((a, b) => a + b, 0)}  max=${Math.max(...totals)}`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(24)} matches=${String(v.total).padStart(3)}  delivered=${v.delivered.length}`);
