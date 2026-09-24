/**
 * Reads the legacy YAML index + per-topic Markdown into graph pieces for the
 * migrator. The index is committed content, so every topic `file` is untrusted:
 * it must stay inside `<projectRoot>/.agentsmesh/lessons/` or nothing is read.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { assertPathInsideRoot } from '../utils/filesystem/path-containment.js';
import type { AddLessonInput } from './add.js';
import type { Lesson, Topic, Trigger } from './graph-schema.js';
import { collectClusterTriggerIds, LegacyIndexSchema } from './import-legacy-parse.js';
import { parseRulesSection } from './import-legacy-rules.js';
import { lessonsPaths } from './paths.js';

const LESSONS_DIR = '.agentsmesh/lessons';

/** Thrown when a legacy index points a topic file outside `.agentsmesh/lessons/`. */
export class LegacyTopicPathError extends Error {
  readonly code = 'LEGACY_TOPIC_PATH_OUTSIDE';
  constructor(file: string) {
    super(
      `Legacy topic file path is outside .agentsmesh/lessons/: ${file}. Refusing to migrate (legacy artifacts left intact).`,
    );
    this.name = 'LegacyTopicPathError';
  }
}

/**
 * Resolve a project-relative legacy topic path, refusing absolute paths, drive
 * or UNC paths (on any host OS), traversal after normalization, and symlinks
 * that resolve outside the lessons directory.
 */
async function resolveLegacyTopicPath(projectRoot: string, file: string): Promise<string> {
  const forward = file.replaceAll('\\', '/');
  const normalized = posix.normalize(forward);
  const relative =
    !/^[A-Za-z]:/.test(forward) &&
    !forward.startsWith('/') &&
    normalized.startsWith(`${LESSONS_DIR}/`);
  if (!relative) throw new LegacyTopicPathError(file);
  const target = join(projectRoot, normalized);
  try {
    await assertPathInsideRoot(join(projectRoot, LESSONS_DIR), target);
  } catch {
    throw new LegacyTopicPathError(file);
  }
  return target;
}

export interface LegacySource {
  readonly topics: Record<string, Topic>;
  readonly triggers: Record<string, Trigger>;
  readonly lessons: Record<string, Lesson>;
  /** Per-lesson specs for the MERGE path (rule + raw trigger patterns + topic). */
  readonly specs: AddLessonInput[];
  readonly summaryByTopic: Map<string, string>;
}

/**
 * Parse the legacy store. Throws (nothing written or deleted) on a malformed
 * index, a topic path outside the lessons directory, or a missing topic file.
 */
export async function readLegacySource(
  projectRoot: string,
  migratedAt: string,
): Promise<LegacySource> {
  const index = LegacyIndexSchema.parse(
    parseYaml(readFileSync(lessonsPaths(projectRoot).index, 'utf8')),
  );
  const topics: Record<string, Topic> = {};
  const triggersById = new Map<string, Trigger>();
  const triggerIdByKey = new Map<string, string>();
  const lessons: Record<string, Lesson> = {};
  const specs: AddLessonInput[] = [];
  const summaryByTopic = new Map<string, string>();

  for (const cluster of index.clusters) {
    topics[cluster.topic] = { summary: cluster.summary };
    summaryByTopic.set(cluster.topic, cluster.summary);
    const clusterTriggerIds = collectClusterTriggerIds(cluster, triggersById, triggerIdByKey);

    const topicFile = await resolveLegacyTopicPath(projectRoot, cluster.file);
    if (!existsSync(topicFile)) {
      // Fail closed: migrating an incomplete graph would then delete the source.
      throw new Error(
        `Legacy topic file is missing: ${cluster.file}. Refusing to migrate (legacy artifacts left intact).`,
      );
    }

    const parsed = parseRulesSection(readFileSync(topicFile, 'utf8'));
    if (parsed.strayLine !== null) {
      throw new Error(
        `Legacy lessons were not migrated: ${cluster.file} line ${parsed.strayLine} is a list ` +
          'item outside a "## Rules" or "## Lessons" section. Move it under one of them or ' +
          'delete it, then run `agentsmesh lessons import-md`. Nothing was changed.',
      );
    }
    for (const { index: ruleIndex, body, evidence } of parsed.rules) {
      const lessonEvidence = [
        `legacy:${cluster.file}#rule-${ruleIndex}`,
        ...evidence.map((e) => `legacy:${e}`),
      ];
      lessons[`${cluster.topic}-rule-${ruleIndex}`] = {
        rule: body,
        topics: [cluster.topic],
        triggers: clusterTriggerIds,
        evidence: lessonEvidence,
        status: 'active',
        createdAt: migratedAt,
      };
      specs.push({
        rule: body,
        topic: cluster.topic,
        triggers: {
          files: cluster.triggers.file_globs,
          commands: cluster.triggers.command_patterns,
          keywords: cluster.triggers.keywords,
        },
        evidence: lessonEvidence,
        createdAt: migratedAt,
      });
    }
  }

  return { topics, triggers: Object.fromEntries(triggersById), lessons, specs, summaryByTopic };
}
