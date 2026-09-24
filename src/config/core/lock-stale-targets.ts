/**
 * `stale_targets` in `.agentsmesh/.lock`: enabled targets a `generate --targets`
 * run left out after the canonical sources changed. Their outputs are older
 * than the lock's checksums, so `check` fails until they are generated again
 * (#136). A full run clears the list; it is absent when it would be empty.
 */

export function parseStaleTargets(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const targets = raw.filter((target): target is string => typeof target === 'string');
  return targets.length > 0 ? targets : undefined;
}

/**
 * Stale targets after a run that skipped `skipped`: all of them when the
 * sources changed, else only those that were already stale. Every target the
 * run generated is current again.
 */
export function nextStaleTargets(
  previous: readonly string[] | undefined,
  skipped: readonly string[],
  sourcesChanged: boolean,
): string[] | undefined {
  const stale = sourcesChanged
    ? [...skipped]
    : skipped.filter((target) => previous?.includes(target) === true);
  return stale.length > 0 ? stale.sort() : undefined;
}
