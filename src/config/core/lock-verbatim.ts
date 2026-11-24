/** Parse `verbatim_outputs` from a lock YAML document. */

export function parseVerbatimOutputs(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const paths = raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .map((entry) => entry.replaceAll('\\', '/'));
  return paths;
}
