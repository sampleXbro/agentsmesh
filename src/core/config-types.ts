/** Lock file structure */
export interface LockFile {
  generatedAt: string;
  generatedBy: string;
  libVersion: string;
  checksums: Record<string, string>;
  extends: Record<string, string>;
  packs: Record<string, string>;
  /**
   * Checksums of generated target outputs, keyed by project-root-relative
   * forward-slash path (e.g. `AGENTS.md`, `.claude/commands/foo.md`) →
   * `sha256:<hex>`. Optional: locks written before output tracking lack this
   * key. `undefined` (not `{}`) signals an old-format lock; downstream drift
   * detection skips output verification in that case.
   */
  outputs?: Record<string, string>;
  /** Targets a `generate --targets` run left out after sources changed; see lock-stale-targets.ts. */
  staleTargets?: string[];
}
