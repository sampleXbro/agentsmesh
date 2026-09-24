export type ErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'VALIDATION_FAILED'
  | 'INVALID_NAME'
  | 'PATH_TRAVERSAL'
  | 'PROTECTED_FILE'
  | 'LOCK_HELD'
  | 'NO_PROJECT'
  | 'IO_ERROR'
  | 'LIMIT_EXCEEDED'
  | 'REFRESH_RESOLVE_FAILED'
  | 'REFRESH_APPLY_FAILED';

const ABSOLUTE_PATH_RE = /(^|\s)\/[A-Za-z]|^[A-Z]:[\\/]/;

export class McpError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    if (ABSOLUTE_PATH_RE.test(message)) {
      throw new Error(`McpError refuses absolute fs path in message: ${message}`);
    }
    super(message);
    this.code = code;
    this.details = details;
  }
  toEnvelope(): { code: ErrorCode; message: string; details?: unknown } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

/**
 * Redact filesystem paths from raw `Error.message` strings so non-`McpError`
 * fallbacks (e.g. ENOENT from `node:fs/promises`) do not leak the host's
 * directory layout to MCP clients.
 *
 * Strips paths anywhere in the string — not only at line start or after
 * whitespace — so embedded paths in stack frames (`at Foo (/Users/...)`)
 * and quoted paths in node errors (`ENOENT, open '/Users/...'`) are caught
 * along with the leading-whitespace shape. A slash inside a word
 * (`origin/main`, `src/cli`) starts no absolute path and is kept.
 */
export function redactAbsolutePaths(message: string): string {
  return (
    message
      // Quoted paths (preserve the surrounding quote glyph).
      .replace(/(['"`])\/[^'"`\s]+\1/gu, '$1<redacted>$1')
      .replace(/(['"`])[A-Z]:[\\/][^'"`\s]+\1/gu, '$1<redacted>$1')
      // Unquoted POSIX paths: a slash that starts a token.
      .replace(/(^|[^\w.-])\/[A-Za-z][^\s'"`<>()]*/gu, '$1<redacted>')
      // Unquoted Windows paths anywhere in the string.
      .replace(/[A-Z]:[\\/][^\s'"`<>()]*/gu, '<redacted>')
  );
}
