/** Shared runtime type guards. */

/** True for a non-null, non-array object — the shape every config/settings merger narrows to. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
