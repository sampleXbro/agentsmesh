import { existsSync } from 'node:fs';
import { graphFilePath } from '../../lessons/graph-store.js';
import { importLegacyLessons } from '../../lessons/import-legacy.js';
import { lessonsPaths } from '../../lessons/paths.js';
import { errorResult, stringFlag, todayIso, type LessonsFlags } from './lessons-helpers.js';
import type { LessonsCommandResult, LessonsImportMdData } from './lessons-types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z?)?$/;

/** True for a real calendar date (or date-time) in the graph's ISO form. */
function isRealIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (m === null) return false;
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day &&
    hour! <= 23 &&
    minute! <= 59 &&
    second! <= 59
  );
}

/**
 * One-shot migrator from the legacy `index.yaml` + `topics/*.md` + `journal.md`
 * store into the JSON graph. Split into its own module so the write-handler file
 * stays focused (and under the repository's 200-line ceiling).
 */
export async function doImportMd(
  flags: LessonsFlags,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  const migratedAtFlag = stringFlag(flags, 'migrated-at');
  if (migratedAtFlag !== null && !isRealIsoDate(migratedAtFlag)) {
    const error =
      '--migrated-at must be a real date, like 2026-06-05 or 2026-06-05T10:30:00Z ' +
      `(got ${JSON.stringify(migratedAtFlag)}).`;
    return errorResult('import-md', error, 2);
  }
  const force = flags.force === true;
  const merge = flags.merge === true;
  if (!force && !merge && existsSync(graphFilePath(projectRoot))) {
    return errorResult(
      'import-md',
      'lessons.json already exists. Pass --merge to fold legacy lessons into it (recommended — recovers stranded lessons without data loss), or --force to overwrite.',
      1,
    );
  }
  // Guard the legacy read: importLegacyLessons reads index.yaml unconditionally
  // and throws a raw ENOENT when it is absent. Fail with a clean message instead.
  if (!existsSync(lessonsPaths(projectRoot).index)) {
    return errorResult(
      'import-md',
      'No legacy lessons store found (.agentsmesh/lessons/index.yaml) — nothing to migrate.',
      1,
    );
  }
  const migratedAt = migratedAtFlag ?? todayIso();
  const report = await importLegacyLessons(projectRoot, { migratedAt, force, merge });
  const data: LessonsImportMdData = {
    topicCount: report.topicCount,
    lessonCount: report.lessonCount,
    triggerCount: report.triggerCount,
    wroteGraphPath: report.wroteGraphPath,
    deletedPaths: report.deletedPaths,
  };
  return { subcommand: 'import-md', exitCode: 0, data };
}
