/**
 * Rovo Dev `toolPermissions` builder — projects canonical `allow`/`ask`/`deny`
 * pattern lists onto the real nested schema documented at
 * https://support.atlassian.com/rovo/docs/manage-rovo-dev-cli-settings/:
 *
 *   toolPermissions:
 *     tools:
 *       <toolName>: allow|ask|deny        # e.g. "Read", "Read(./.env)"
 *       bash:
 *         default: allow|ask|deny          # bare "Bash" pattern
 *         commands:                        # "Bash(<command>[:*])" patterns
 *           - command: <command>
 *             permission: allow|ask|deny
 */

import type { Permissions } from '../../core/types.js';

type Decision = 'allow' | 'ask' | 'deny';

interface BashSubTable {
  default?: Decision;
  commands?: { command: string; permission: Decision }[];
}

/** Extracts the raw command string from a `Bash(<command>[:*])` canonical pattern. */
function bashCommandFromPattern(pattern: string): string | null {
  const match = /^Bash\((.*)\)$/s.exec(pattern.trim());
  if (!match) return null;
  let command = match[1]!.trim();
  if (command.endsWith(':*')) command = command.slice(0, -2).trim();
  return command || null;
}

export function buildToolPermissions(permissions: Permissions): Record<string, unknown> | null {
  const entries: { pattern: string; decision: Decision }[] = [
    ...(permissions.allow ?? []).map((pattern) => ({ pattern, decision: 'allow' as const })),
    ...(permissions.ask ?? []).map((pattern) => ({ pattern, decision: 'ask' as const })),
    ...(permissions.deny ?? []).map((pattern) => ({ pattern, decision: 'deny' as const })),
  ];
  if (entries.length === 0) return null;

  const tools: Record<string, unknown> = {};
  const bash: BashSubTable = {};

  for (const { pattern, decision } of entries) {
    if (pattern.trim() === 'Bash') {
      bash.default = decision;
      continue;
    }
    const command = bashCommandFromPattern(pattern);
    if (command !== null) {
      bash.commands = [...(bash.commands ?? []), { command, permission: decision }];
      continue;
    }
    tools[pattern] = decision;
  }

  if (bash.default !== undefined || bash.commands !== undefined) {
    tools.bash = bash;
  }

  return { tools };
}
