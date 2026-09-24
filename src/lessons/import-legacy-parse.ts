import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Trigger, TriggerKind } from './graph-schema.js';

const LegacyTriggersSchema = z
  .object({
    file_globs: z.array(z.string()),
    command_patterns: z.array(z.string()),
    keywords: z.array(z.string()),
  })
  .refine((t) => t.file_globs.length + t.command_patterns.length + t.keywords.length > 0, {
    message: 'cluster must declare at least one trigger of any type',
  });

const LegacyClusterSchema = z.object({
  topic: z.string().regex(/^[a-z0-9-]+$/),
  file: z.string().regex(/\.md$/),
  summary: z.string().min(1),
  triggers: LegacyTriggersSchema,
});

export const LegacyIndexSchema = z.object({
  version: z.literal(1),
  clusters: z.array(LegacyClusterSchema),
});

type LegacyCluster = z.infer<typeof LegacyClusterSchema>;

interface TriggerSpec {
  readonly kind: TriggerKind;
  readonly pattern: string;
}

export function collectClusterTriggerIds(
  cluster: LegacyCluster,
  triggersById: Map<string, Trigger>,
  triggerIdByKey: Map<string, string>,
): string[] {
  const specs: TriggerSpec[] = [
    ...cluster.triggers.file_globs.map((p): TriggerSpec => ({ kind: 'file_glob', pattern: p })),
    ...cluster.triggers.command_patterns.map(
      (p): TriggerSpec => ({ kind: 'command_pattern', pattern: p }),
    ),
    ...cluster.triggers.keywords.map((p): TriggerSpec => ({ kind: 'keyword', pattern: p })),
  ];

  const ids: string[] = [];
  for (const spec of specs) {
    const key = `${spec.kind}|${spec.pattern}`;
    let id = triggerIdByKey.get(key);
    if (id === undefined) {
      id = makeTriggerId(spec);
      triggerIdByKey.set(key, id);
      triggersById.set(id, { kind: spec.kind, pattern: spec.pattern });
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

const TRIGGER_PREFIX: Record<TriggerKind, string> = {
  file_glob: 'glob',
  command_pattern: 'cmd',
  keyword: 'kw',
};

function makeTriggerId(spec: TriggerSpec): string {
  const hash = createHash('sha1').update(`${spec.kind}|${spec.pattern}`).digest('hex').slice(0, 8);
  return `t-${TRIGGER_PREFIX[spec.kind]}-${hash}`;
}

// journal.md and journal.legacy.md are kept: their notes are not rules, so
// the migration cannot turn them into lessons, and deleting them lost them (#138).
const LEGACY_ARTIFACT_REL = [
  'index.yaml',
  'topics',
  'distill-ledger.yaml',
  'distill-proposal.md',
] as const;

export function deleteLegacyArtifacts(baseDir: string): string[] {
  const deleted: string[] = [];
  for (const rel of LEGACY_ARTIFACT_REL) {
    const abs = join(baseDir, rel);
    if (!existsSync(abs)) continue;
    rmSync(abs, { recursive: true, force: true });
    deleted.push(abs);
  }
  return deleted;
}
