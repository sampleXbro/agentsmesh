/** Result of generating files for a target */
export interface GenerateResult {
  /** Target tool ID */
  target: string;
  /** File path (relative to project root) */
  path: string;
  /** File content (what would be written) */
  content: string;
  /** Current on-disk content, set when status is updated or unchanged */
  currentContent?: string;
  /** What happened: created, updated, unchanged, skipped */
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
  /** If skipped, why */
  skipReason?: string;
  /** Optional POSIX mode passed through to `writeFileAtomic` (e.g. `0o755`). */
  mode?: number;
}

/** Result of importing from a tool */
export interface ImportResult {
  /** Source tool */
  fromTool: string;
  /** Source file path */
  fromPath: string;
  /** Destination canonical path */
  toPath: string;
  /** What was imported */
  feature: string;
}

/** Lint diagnostic */
export interface LintDiagnostic {
  level: 'error' | 'warning';
  file: string;
  target: string;
  message: string;
}

/** Feature support level per target */
export type SupportLevel = 'native' | 'embedded' | 'partial' | 'none';

/** Compatibility matrix row */
export interface CompatibilityRow {
  feature: string;
  count: number;
  support: Record<string, SupportLevel>;
}
