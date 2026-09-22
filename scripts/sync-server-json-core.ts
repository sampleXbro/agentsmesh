/**
 * Pure half of the server.json version sync, so it can be tested without
 * touching the repository. See sync-server-json.ts for the executable half.
 */

export function syncServerManifest(manifestText: string, version: string): string {
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;
  manifest.version = version;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
