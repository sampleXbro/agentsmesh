import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Document, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { agentsmeshInvocation } from './cli-invocation.js';

/**
 * Auto-wire hook-mode recall: inject `agentsmesh lessons hook` into canonical
 * `.agentsmesh/hooks.yaml`, so `generate` projects it to every hook-capable target
 * and recall becomes deterministic (no extra model turn, no compliance dependence):
 *
 * - `PreToolUse` — recall injects BEFORE every mutating tool call. It fires on each
 *   call, not only the first touch, so it is the whole tool-call story.
 * - `UserPromptSubmit` — the ONLY event that carries the task text (no `tool_input`),
 *   so it is the sole moment a keyword/conceptual ("general") lesson can recall
 *   against task INTENT rather than a file path / command token. Uses matcher `*`
 *   (prompt events have no tool to match).
 *
 * `PostToolUse` is deliberately NOT wired, and a previously scaffolded entry there
 * is removed. Alongside PreToolUse it re-ran recall for the same action after the
 * fact: a second process and a second context block per tool call, carrying
 * advice that could no longer be applied. Field data showed 63% of recalls
 * arriving within 3s of a same-shaped one. Cursor, Copilot and Gemini CLI can
 * inject on PostToolUse but not PreToolUse, so they get no tool-call recall from
 * hooks; their agents recall through the always-on paragraph instead.
 *
 * Generate keeps a recall entry only on the events where a target's hook output
 * reaches the model (`TargetDescriptor.hookContextEvents`), so wiring these
 * everywhere is safe; targets without such an event keep relying on the
 * always-on lessons paragraph in their root instruction — the universal fallback.
 *
 * The command comes from `agentsmeshInvocation`: `npx --no --offline` when the
 * project depends on agentsmesh (a teammate without a global install still
 * gets recall, and the pinned version wins), else the faster bare command.
 *
 * Each event carries exactly ONE managed entry (the recall hook, bare or
 * npx-launched, with no extra args). A re-run rewrites its command in place when
 * it drifts — e.g. after agentsmesh becomes a devDependency — and keeps a matcher
 * the user chose (only the older scaffold default is upgraded). A managed entry
 * the user deleted comes back: `init --lessons` is an explicit request to wire
 * recall. User entries are never touched. Edited via the YAML Document API so
 * the file's `# yaml-language-server` schema directive and comments survive (a
 * parse()→stringify() round-trip would silently drop them).
 *
 * A missing `hooks.yaml` is created only when the caller passes a template
 * (`init --lessons`); otherwise it is left alone and reported as skipped.
 */

const RECALL_SUBCOMMAND = 'lessons hook';
/** The recall hook as a bare command; every launcher form contains it. */
export const RECALL_HOOK_COMMAND = `agentsmesh ${RECALL_SUBCOMMAND}`;
/**
 * Mutating tools the PreToolUse recall guards. Claude Code compares a `|` list
 * by exact tool name, so notebook edits and PowerShell need their own names.
 */
const RECALL_HOOK_TOOL_MATCHER = 'Edit|Write|NotebookEdit|Bash|PowerShell';
/** A scaffold-written entry: the recall hook, bare or npx-launched, no extra args. */
const MANAGED_COMMAND = new RegExp(`^(?:npx(?: --?[\\w-]+)* )?${RECALL_HOOK_COMMAND}$`);

/** The recall hook command for this project (see `agentsmeshInvocation`). */
export function recallHookCommand(projectRoot: string): string {
  return `${agentsmeshInvocation(projectRoot)} ${RECALL_SUBCOMMAND}`;
}

/** True for any command that runs the recall hook, however it is launched. */
export function isRecallHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes(RECALL_HOOK_COMMAND);
}

/** True for a recall hook command the scaffold wrote: bare or npx-launched, no extra args. */
export function isManagedRecallCommand(command: unknown): command is string {
  return typeof command === 'string' && MANAGED_COMMAND.test(command.trim());
}

function isManaged(item: unknown): item is YAMLMap {
  return item instanceof YAMLMap && isManagedRecallCommand(item.get('command'));
}

/**
 * Events the recall hook wires, each with the matcher that event needs. Tool-call
 * events match the mutating tools; `UserPromptSubmit` fires on every prompt (`*`).
 */
const RECALL_EVENTS: ReadonlyArray<{ readonly event: string; readonly matcher: string }> = [
  { event: 'PreToolUse', matcher: RECALL_HOOK_TOOL_MATCHER },
  { event: 'UserPromptSubmit', matcher: '*' },
  // Capture-on-failure nudge (see capture-nudge.ts). BEST-EFFORT: targets with
  // no failure event drop it without warning (BEST_EFFORT_HOOK_EVENTS).
  // PostToolUse is success-only, so failures need this.
  { event: 'PostToolUseFailure', matcher: '*' },
  // Reset recall dedup after a context compaction/clear (see hook.ts SessionStart).
  // BEST-EFFORT: targets that can't represent SessionStart just keep dedup as-is.
  { event: 'SessionStart', matcher: '*' },
];

/** The tool-call matcher the first scaffold wrote; the only user-visible value a re-run upgrades. */
const LEGACY_TOOL_MATCHER = 'Edit|Write|Bash';

/** Events an older scaffold wired that recall must no longer ride (see above). */
const RETIRED_EVENTS: readonly string[] = ['PostToolUse'];

/**
 * Remove the managed recall entry from one event, leaving the user's own hooks
 * there untouched; drop the key when nothing remains. Returns true when changed.
 */
function removeEvent(doc: Document, event: string): boolean {
  const existing = doc.get(event);
  if (!(existing instanceof YAMLSeq)) return false;
  const kept = existing.items.filter((item) => !isManaged(item));
  if (kept.length === existing.items.length) return false;
  if (kept.length === 0) doc.delete(event);
  else existing.items = kept;
  return true;
}

/**
 * Leave exactly one managed recall entry on `event`: add it when missing, fix a
 * drifted `command`/`type` in place (other keys such as `timeout` stay), drop
 * duplicates. An existing `matcher` is the user's and stays, except one the
 * scaffold itself wrote earlier. Returns true when anything changed.
 */
function upsertEvent(doc: Document, event: string, matcher: string, command: string): boolean {
  const existing = doc.get(event);
  const seq = existing instanceof YAMLSeq ? existing : new YAMLSeq();
  const [first, ...extra] = seq.items.filter(isManaged);
  if (first === undefined) {
    seq.add(doc.createNode({ matcher, type: 'command', command }));
    doc.set(event, seq);
    return true;
  }
  let changed = extra.length > 0;
  if (changed) seq.items = seq.items.filter((item) => !extra.includes(item as YAMLMap));
  const current = first.get('matcher');
  const upgrade =
    current === undefined ||
    (current === LEGACY_TOOL_MATCHER && matcher === RECALL_HOOK_TOOL_MATCHER);
  const desired = { ...(upgrade ? { matcher } : {}), type: 'command', command };
  for (const [key, value] of Object.entries(desired)) {
    if (first.get(key) === value) continue;
    first.set(key, value);
    changed = true;
  }
  return changed;
}

function syncRecallEntries(doc: Document, command: string): boolean {
  let changed = false;
  for (const { event, matcher } of RECALL_EVENTS) {
    if (upsertEvent(doc, event, matcher, command)) changed = true;
  }
  for (const event of RETIRED_EVENTS) {
    if (removeEvent(doc, event)) changed = true;
  }
  return changed;
}

/** What happened to the recall hook; a skip always says why. */
export type RecallHookOutcome =
  | { readonly status: 'created' }
  | { readonly status: 'wired' }
  | { readonly status: 'current' }
  | { readonly status: 'skipped'; readonly reason: string };

const HOOKS_FILE = '.agentsmesh/hooks.yaml';

/**
 * Wire the recall hook into `hooks.yaml`. `created`: the file was missing and
 * `hooksTemplate` seeded it; `wired`: entries were added, rewritten or removed;
 * `current`: nothing to do; `skipped`: no file (and no template) or an
 * unreadable one, left untouched.
 */
export function wireRecallHook(projectRoot: string, hooksTemplate?: string): RecallHookOutcome {
  const path = join(projectRoot, '.agentsmesh', 'hooks.yaml');
  const missing = !existsSync(path);
  if (missing && hooksTemplate === undefined) {
    return { status: 'skipped', reason: `there is no ${HOOKS_FILE} to wire it into` };
  }
  // Document API (not parse→stringify) so the schema directive + comments survive.
  const doc = parseDocument(missing ? (hooksTemplate ?? '') : readFileSync(path, 'utf8'));
  if (doc.errors.length > 0) {
    return { status: 'skipped', reason: `${HOOKS_FILE} is not valid YAML` };
  }
  if (doc.contents !== null && !(doc.contents instanceof YAMLMap)) {
    return { status: 'skipped', reason: `${HOOKS_FILE} does not hold a map of events` };
  }
  const changed = syncRecallEntries(doc, recallHookCommand(projectRoot));
  if (!changed && !missing) return { status: 'current' };
  if (missing) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(doc), 'utf8');
  return { status: missing ? 'created' : 'wired' };
}

/**
 * True when any managed entry was added, rewritten or removed in an EXISTING
 * hooks.yaml; false when everything is current, or there is no usable file.
 */
export function injectRecallHook(projectRoot: string): boolean {
  const { status } = wireRecallHook(projectRoot);
  return status === 'wired';
}
