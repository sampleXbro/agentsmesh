/**
 * Copy package.json's version into the MCP registry manifest.
 *
 * Runs from the `version` npm script, which changesets/action invokes when it
 * builds the release PR — so server.json's version is generated alongside the
 * CHANGELOG rather than hand-bumped and forgotten.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { syncServerManifest } from './sync-server-json-core.js';

const manifestPath = resolve(process.argv[2] ?? 'server.json');
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string;
};

const before = readFileSync(manifestPath, 'utf8');
const after = syncServerManifest(before, version);

if (after === before) {
  process.stdout.write(`sync-server-json OK: already at ${version}.\n`);
} else {
  writeFileSync(manifestPath, after);
  process.stdout.write(`sync-server-json: server.json updated to ${version}.\n`);
}
