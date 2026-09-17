/**
 * Typed error taxonomy for agentsmesh programmatic consumers.
 *
 * All public-API errors inherit from AgentsMeshError and carry a stable `code`
 * property. Consumers can branch on `err instanceof AgentsMeshError && err.code === 'AM_...'`
 * without relying on error message strings.
 */

export type AgentsMeshErrorCode =
  | 'AM_CONFIG_NOT_FOUND'
  | 'AM_CONFIG_INVALID'
  | 'AM_TARGET_NOT_FOUND'
  | 'AM_IMPORT_FAILED'
  | 'AM_GENERATION_FAILED'
  | 'AM_REMOTE_FETCH_FAILED'
  | 'AM_LOCK_ACQUISITION_FAILED'
  | 'AM_FILESYSTEM';

export class AgentsMeshError extends Error {
  readonly code: AgentsMeshErrorCode;

  constructor(code: AgentsMeshErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AgentsMeshError';
    this.code = code;
  }
}

export class ConfigNotFoundError extends AgentsMeshError {
  readonly path: string;

  constructor(path: string, options?: { cause?: unknown; message?: string }) {
    super(
      'AM_CONFIG_NOT_FOUND',
      options?.message ??
        `agentsmesh.yaml not found at ${path}. Run 'agentsmesh init' to create one.`,
      options,
    );
    this.name = 'ConfigNotFoundError';
    this.path = path;
  }
}

export class ConfigValidationError extends AgentsMeshError {
  readonly issues: readonly string[];

  constructor(path: string, issues: readonly string[], options?: { cause?: unknown }) {
    super(
      'AM_CONFIG_INVALID',
      `Invalid config at ${path}: ${issues.join('; ')}. Fix the YAML and try again.`,
      options,
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/** A user-authored canonical file (mcp.json, permissions.yaml, hooks.yaml) has a syntax error. */
export class CanonicalParseError extends AgentsMeshError {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      'AM_CONFIG_INVALID',
      `Invalid canonical file ${path}: ${detail}. Fix the syntax and try again.`,
      {
        cause,
      },
    );
    this.name = 'CanonicalParseError';
    this.path = path;
  }
}

export class TargetNotFoundError extends AgentsMeshError {
  readonly target: string;

  constructor(target: string, options?: { cause?: unknown; supported?: readonly string[] }) {
    const suffix = options?.supported ? ` Supported: ${options.supported.join(', ')}.` : '';
    super('AM_TARGET_NOT_FOUND', `Unknown target "${target}".${suffix}`, options);
    this.name = 'TargetNotFoundError';
    this.target = target;
  }
}

export class ImportError extends AgentsMeshError {
  readonly target: string;

  constructor(target: string, message: string, options?: { cause?: unknown }) {
    super('AM_IMPORT_FAILED', `Import from ${target} failed: ${message}`, options);
    this.name = 'ImportError';
    this.target = target;
  }
}

export class GenerationError extends AgentsMeshError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('AM_GENERATION_FAILED', message, options);
    this.name = 'GenerationError';
  }
}

export class RemoteFetchError extends AgentsMeshError {
  readonly source: string;

  constructor(source: string, message: string, options?: { cause?: unknown }) {
    super('AM_REMOTE_FETCH_FAILED', `Remote fetch for "${source}" failed: ${message}`, options);
    this.name = 'RemoteFetchError';
    this.source = source;
  }
}

export class LockAcquisitionError extends AgentsMeshError {
  readonly lockPath: string;
  readonly holder: string;
  /** Human-readable lock name surfaced in the message, e.g. "lessons lock". */
  readonly label: string;

  constructor(lockPath: string, holder: string, options?: { cause?: unknown; label?: string }) {
    const label = options?.label ?? 'lock';
    super(
      'AM_LOCK_ACQUISITION_FAILED',
      `Could not acquire ${label} at ${lockPath}: currently held by ${holder}. ` +
        `Wait for the other process to finish, or remove ${lockPath} manually if you are sure no agentsmesh process is running.`,
      options,
    );
    this.name = 'LockAcquisitionError';
    this.lockPath = lockPath;
    this.holder = holder;
    this.label = label;
  }
}

export class FileSystemError extends AgentsMeshError {
  readonly path: string;
  readonly errnoCode?: string;

  constructor(path: string, message: string, options?: { cause?: unknown; errnoCode?: string }) {
    super('AM_FILESYSTEM', message, options);
    this.name = 'FileSystemError';
    this.path = path;
    this.errnoCode = options?.errnoCode;
  }
}
