import { existsSync } from 'node:fs';
import { lessonsPaths } from '../lessons/paths.js';

/**
 * Standing instructions handed to every MCP client at initialize.
 *
 * `init --lessons` puts the recall/capture contract into
 * `.agentsmesh/rules/_root.md`, so it reaches each tool as a root rule. A
 * plugin has no such reach: it ships skills, hooks and servers, never the
 * user's instruction file. This field is the one channel left, and unlike a
 * hook it costs nothing per tool call.
 *
 * It is state-aware because this server is not only a lessons server. It also
 * carries the config tools, and most people who wire it up never opted into
 * lessons. Sending them the binding contract named a graph they do not have,
 * pointed at a skill they never installed, and required a query before every
 * edit that could only return nothing — and obeying the capture half would
 * have written a graph into a repository that never asked for one.
 */
export function mcpServerInstructions(projectRoot: string): string {
  return hasLessons(projectRoot) ? ACTIVE : INACTIVE;
}

/**
 * Either signal counts. `config.json` means the full setup ran; the graph alone
 * means someone captured through the tools without it. Both mean there are
 * lessons here to recall.
 */
function hasLessons(projectRoot: string): boolean {
  const paths = lessonsPaths(projectRoot);
  return existsSync(paths.graph) || existsSync(paths.config);
}

/**
 * Same three obligations as `LESSONS_PROCEDURAL_RULE`, in tool vocabulary
 * rather than shell — a client reading this may have no shell at all. Kept
 * compact because it is always-on context; the argument for the rules lives in
 * the `lessons` skill.
 */
const ACTIVE = `## Lessons (BLOCKING)

Graph \`.agentsmesh/lessons/lessons.json\` is canonical; never hand-edit it. Full manual: the \`lessons\` skill.

**Recall:** before every file edit or state-changing command, MUST call \`lessons_query\` with \`file\`/\`command\` and obey every match; at task start ALSO call it with \`keyword\` plus \`always: true\` for conceptual and universal rules. Pure-read commands and recall itself are exempt.

**Capture:** after any failure, user correction, regression, wrong assumption, useful surprise, repeated friction, or non-obvious fix, MUST self-critique and call \`lessons_add\` with an imperative rule, a topic, and a trigger.

**Before final:** report \`Lesson: captured <id>\` or \`Lesson: none\`. No recall/capture gate = task incomplete.`;

/** Describes the capability without asserting anything that is not on disk. */
const INACTIVE = `## Lessons

This server can keep a git-tracked memory of rules for this repository, recalled before an edit and captured after a failure. Nothing is set up here yet, so \`lessons_query\` returns no matches.

To start one, call \`lessons_add\` with a rule, a topic, \`new_topic: true\`, a \`topic_summary\` and a \`trigger_file\` glob. To wire automatic recall into your AI tools as well, run \`agentsmesh init --lessons\` and then \`agentsmesh generate\`.`;
