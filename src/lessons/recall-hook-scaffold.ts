import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * npx-launched, with no extra args). A re-run rewrites its command and matcher
 * in place when they drift — e.g. after agentsmesh becomes a devDependency —
 * and never touches user entries. Edited via the YAML Document API so the
 * file's `# yaml-language-server` schema directive and comments survive (a
 * parse()→stringify() round-trip would silently drop them).
 *
 * Only injects into an EXISTING `hooks.yaml` — it never force-creates one, so a
 * project that does not use hooks is left untouched (and `init` always scaffolds
 * `hooks.yaml` before this runs, so the `init --lessons` flow is covered).
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
 * Leave exactly one managed recall entry on `event`, carrying `matcher` and
 * `command`: add it when missing, rewrite a drifted one in place (other keys
 * such as `timeout` stay), drop duplicates. Returns true when anything changed.
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
  const desired = { matcher, type: 'command', command } as const;
  for (const [key, value] of Object.entries(desired)) {
    if (first.get(key) === value) continue;
    first.set(key, value);
    changed = true;
  }
  return changed;
}

/**
 * Returns true when any managed entry was added, rewritten or removed; false
 * when everything is already current or there is no hooks.yaml.
 */
export function injectRecallHook(projectRoot: string): boolean {
  const path = join(projectRoot, '.agentsmesh', 'hooks.yaml');
  if (!existsSync(path)) return false;

  // Document API (not parse→stringify) so the schema directive + comments survive.
  const doc = parseDocument(readFileSync(path, 'utf8'));
  const command = recallHookCommand(projectRoot);
  let changed = false;
  for (const { event, matcher } of RECALL_EVENTS) {
    if (upsertEvent(doc, event, matcher, command)) changed = true;
  }
  for (const event of RETIRED_EVENTS) {
    if (removeEvent(doc, event)) changed = true;
  }
  if (changed) writeFileSync(path, String(doc), 'utf8');
  return changed;
}
