import type { SkippedSettings } from '../canonical/load/unmanaged-settings.js';
import type { KeptOutput } from '../core/generate/removed-outputs.js';

export interface GenerateData {
  scope: 'project' | 'global';
  mode: 'generate' | 'check' | 'dry-run';
  files: Array<{ path: string; target: string; status: 'created' | 'updated' | 'unchanged' }>;
  summary: { created: number; updated: number; unchanged: number };
  /**
   * Why zero files were produced, when known. `no-global-support` means every
   * active target lacks a global layout (e.g. cloud-only jules/replit-agent in
   * `--global`); the renderer surfaces that instead of the misleading default
   * "no root rule / rules feature disabled" cause. Absent when files exist or
   * the cause is the default one.
   */
  emptyReason?: 'no-global-support';
  /**
   * Generated files that nothing produces any more because their target left
   * `targets:`, or the run produced nothing. A run removed them; `--dry-run`
   * lists what it would remove; `--check` counts them as drift. Absent when none.
   */
  removed?: string[];
  /**
   * Files of such a target that were left in place: edited since agentsmesh
   * wrote them, or a tool config the user shares. Absent when none.
   */
  kept?: KeptOutput[];
  /** Pack and extends settings the user's own files do not manage; absent when none. */
  skippedSettings?: SkippedSettings[];
}

/** The `removed` and `kept` fields of a result; both are left out when empty. */
export function removalFields(
  removed: readonly string[],
  kept: readonly KeptOutput[],
): Pick<GenerateData, 'removed' | 'kept'> {
  return {
    ...(removed.length > 0 ? { removed: [...removed] } : {}),
    ...(kept.length > 0 ? { kept: [...kept] } : {}),
  };
}
