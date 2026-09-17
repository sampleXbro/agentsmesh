/** Shared CLI flag parsing. */

/** Parse a comma-separated `--targets` flag; `undefined` means "all targets". */
export function parseTargetsFlag(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
