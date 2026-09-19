/**
 * Which targets a non-interactive `agentsmesh init` enables, and why.
 *
 * Breadth is the wrong default: enabling every builtin made the first
 * `generate` scatter dozens of files and directories across a project that had
 * asked for none of them. Evidence of intent wins instead, strongest first:
 *
 *   1. `--targets a,b`        — the user said so
 *   2. `--all-targets`        — the user asked for breadth explicitly
 *   3. config in the project  — this repo already uses these tools
 *   4. installs on the machine — this developer uses these tools
 *   5. the minimal set        — no evidence at all; stay small and say so
 *
 * Every id is descriptor-derived, so a new target joins these sets by declaring
 * itself rather than by editing a list here.
 */

import {
  minimalInitTargetIds,
  starterInitTargetIds,
} from '../../targets/catalog/init-starter-targets.js';
import { BUILTIN_TARGET_IDS } from '../../targets/catalog/target-ids.js';

/** Which rule picked the targets — drives the one-line hint the CLI prints. */
export type InitTargetSource = 'explicit' | 'all' | 'project' | 'machine' | 'fallback';

export interface InitTargetInputs {
  /** `--targets a,b`, already split. */
  readonly explicit?: readonly string[];
  /** `--all-targets`. */
  readonly allTargets?: boolean;
  /** Target ids with config in the project (or, in global scope, in the home dir). */
  readonly projectDetected: readonly string[];
  /** Target ids installed on the machine. Empty in global scope, where it duplicates the above. */
  readonly machineDetected: readonly string[];
  /**
   * Restricts every outcome, used by global scope to keep the result inside the
   * globally-capable targets. Undefined means "any builtin".
   */
  readonly allowed?: readonly string[];
}

export interface ResolvedInitTargets {
  readonly targets: readonly string[];
  readonly source: InitTargetSource;
}

function sortUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function withinAllowed(ids: readonly string[], allowed: readonly string[] | undefined): string[] {
  return allowed === undefined ? [...ids] : ids.filter((id) => allowed.includes(id));
}

/**
 * Validate `--targets`, which is the one path where a typo should stop the run
 * rather than silently narrow it.
 */
function resolveExplicit(
  explicit: readonly string[],
  allowed: readonly string[] | undefined,
): string[] {
  const ids = sortUnique(explicit.map((id) => id.trim()).filter((id) => id.length > 0));
  if (ids.length === 0) {
    throw new Error('--targets needs at least one target id, e.g. --targets claude-code,cursor');
  }
  const unknown = ids.filter((id) => !BUILTIN_TARGET_IDS.includes(id as never));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown target id(s) in --targets: ${unknown.join(', ')}. ` +
        `Supported: ${[...BUILTIN_TARGET_IDS].join(', ')}.`,
    );
  }
  const disallowed = allowed === undefined ? [] : ids.filter((id) => !allowed.includes(id));
  if (disallowed.length > 0) {
    throw new Error(
      `Target(s) not available in this scope: ${disallowed.join(', ')}. ` +
        `Available: ${[...allowed!].join(', ')}.`,
    );
  }
  return ids;
}

export function resolveInitTargets(inputs: InitTargetInputs): ResolvedInitTargets {
  const { allowed } = inputs;

  if (inputs.explicit !== undefined) {
    return { targets: resolveExplicit(inputs.explicit, allowed), source: 'explicit' };
  }

  if (inputs.allTargets === true) {
    return { targets: withinAllowed(starterInitTargetIds(), allowed), source: 'all' };
  }

  // Config committed in the project is the strongest signal, and it is specific
  // enough to honour even for a target that opts out of bulk scaffolding.
  const fromProject = sortUnique(withinAllowed(inputs.projectDetected, allowed));
  if (fromProject.length > 0) return { targets: fromProject, source: 'project' };

  // An install on the machine is weaker evidence, so it goes through the starter
  // set — bulk-enabling a target that declares a collision with its peers is
  // exactly what `excludeFromStarterInit` exists to prevent.
  const starter = new Set<string>(starterInitTargetIds());
  const fromMachine = sortUnique(
    withinAllowed(inputs.machineDetected, allowed).filter((id) => starter.has(id)),
  );
  if (fromMachine.length > 0) return { targets: fromMachine, source: 'machine' };

  return { targets: withinAllowed(minimalInitTargetIds(), allowed), source: 'fallback' };
}
