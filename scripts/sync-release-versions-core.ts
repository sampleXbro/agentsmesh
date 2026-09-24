/**
 * Pure half of the release version sync, so it can be tested without touching
 * the repository. See sync-release-versions.ts for the executable half.
 */

export function syncVersion(jsonText: string, version: string): string {
  const document = JSON.parse(jsonText) as Record<string, unknown>;
  document.version = version;
  return `${JSON.stringify(document, null, 2)}\n`;
}
