/**
 * Codex edits files through `apply_patch`, whose hook payload carries the
 * patch text instead of a `file_path`. This reads the touched paths (and the
 * added lines, for diff-aware keyword recall) out of that patch envelope.
 */

export interface PatchInfo {
  /** Every touched path in patch order, deduplicated. */
  readonly paths: readonly string[];
  /** Added (`+`) lines without their prefix, newline-joined. */
  readonly added: string;
}

const FILE_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/;
const BEGIN_MARKER = /^\*\*\* Begin Patch\s*$/m;
const PATCH_FIELDS = ['patch', 'command', 'input'] as const;

/** Paths and added lines of a patch; no validation beyond the header shape. */
export function parsePatch(text: string): PatchInfo {
  const paths: string[] = [];
  const added: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const header = FILE_HEADER.exec(line);
    if (header !== null) {
      const path = header[1]!;
      if (!paths.includes(path)) paths.push(path);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.slice(1));
    }
  }
  return { paths, added: added.join('\n') };
}

/**
 * The patch in a tool call, or null. Any tool name counts when the text has a
 * `*** Begin Patch` line (Codex may report an Edit alias); `apply_patch` itself
 * also counts with bare file headers. A patch naming no file is null.
 */
export function patchFromToolInput(toolName: unknown, toolInput: unknown): PatchInfo | null {
  if (typeof toolInput !== 'object' || toolInput === null) return null;
  const record = toolInput as Record<string, unknown>;
  for (const field of PATCH_FIELDS) {
    const text = record[field];
    if (typeof text !== 'string') continue;
    if (toolName !== 'apply_patch' && !BEGIN_MARKER.test(text)) continue;
    const info = parsePatch(text);
    if (info.paths.length > 0) return info;
  }
  return null;
}
