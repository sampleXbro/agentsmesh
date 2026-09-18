/**
 * Import `.aider.conf.yml` hook keys into canonical `.agentsmesh/hooks.yaml`.
 *
 * The config file is aider's, not agentsmesh's, so the import only claims it
 * when at least one of the five owned keys is present — a config that just sets
 * a model must never wipe canonical hooks.
 *
 * The merge is scoped to the KEYS the config actually speaks about, not to the
 * events. `test-cmd` and `notifications-command` hold exactly one command, so
 * generate necessarily leaves canonical entries behind; those entries would be
 * silently deleted by an event-scoped merge. A previous canonical entry is
 * therefore replaced only when it reached a key this config carries, and it is
 * reused verbatim when the command still matches — so its matcher, `timeout`
 * and any other field the config cannot express survive the round trip.
 */

import { AB_HOOKS } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { Document, isMap, parseDocument } from 'yaml';
import type { HookEntry, Hooks } from '../../core/hook-types.js';
import type { ImportResult } from '../../core/types.js';
import { getHookCommand } from '../../core/hook-command.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { projectAiderHooks, type AiderCommandKey, type AiderMappedEntry } from './hooks-format.js';
import { aiderConfToHookEntries, hasAiderHookKeys } from './hooks-read.js';
import { AIDER_TARGET, AIDER_CONF_FILE } from './constants.js';

/** The events aider expresses; only these are rewritten on import. */
const OWNED_EVENTS = ['PostToolUse', 'Notification'] as const;

function parseConf(content: string): unknown {
  const doc = parseDocument(content);
  return doc.errors.length === 0 ? doc.toJS() : null;
}

/** The canonical file as an editable document; comments and key order survive. */
function canonicalDocument(content: string | null): Document {
  if (content !== null) {
    const doc = parseDocument(content);
    if (doc.errors.length === 0 && isMap(doc.contents)) return doc;
  }
  return new Document({});
}

/** The canonical entries currently recorded for `event`. */
function currentEntries(doc: Document, event: string): HookEntry[] {
  const current = (doc.toJS() as Record<string, unknown>)[event];
  if (!Array.isArray(current)) return [];
  return current.filter((entry): entry is HookEntry => typeof entry === 'object' && entry !== null);
}

function canonicalHooks(doc: Document): Hooks {
  return doc.toJS() as Hooks;
}

/** The config key a previous canonical entry reached, if any. */
function keyOf(
  mapped: readonly AiderMappedEntry[],
  event: string,
  entry: HookEntry,
): AiderCommandKey | null {
  const match = mapped.find(
    (item) =>
      item.event === event &&
      item.matcher === (entry.matcher ?? '') &&
      item.command === getHookCommand(entry),
  );
  return match ? match.key : null;
}

export async function importAiderHooks(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, AIDER_CONF_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const conf = parseConf(content);
  if (!hasAiderHookKeys(conf)) return;

  const imported = aiderConfToHookEntries(conf);
  const spoken = new Set(imported.map((item) => item.key));
  const destPath = join(projectRoot, AB_HOOKS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  const mapped = projectAiderHooks(canonicalHooks(doc)).mapped;

  for (const event of OWNED_EVENTS) {
    const previous = currentEntries(doc, event);
    const replaced = previous.filter((entry) => {
      const key = keyOf(mapped, event, entry);
      return key !== null && spoken.has(key);
    });
    const incoming = imported
      .filter((item) => item.event === event)
      .map(
        (item) =>
          replaced.find((entry) => getHookCommand(entry) === getHookCommand(item.entry)) ??
          item.entry,
      );
    const merged = [...incoming, ...previous.filter((entry) => !replaced.includes(entry))];
    if (merged.length > 0) doc.set(event, merged);
    else if (doc.has(event)) doc.delete(event);
  }

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: AIDER_TARGET,
    fromPath: srcPath,
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}
