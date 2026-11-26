/**
 * The stable machine `code` of a thrown domain error, for the `--json` envelope.
 * Node system errors (`ENOENT`, `EACCES`, …) are not part of that contract.
 */
export function errorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const { code, syscall } = err as Error & { code?: unknown; syscall?: unknown };
  if (typeof code !== 'string' || code.length === 0 || syscall !== undefined) return undefined;
  return code;
}
