/**
 * Copy package.json's version into every manifest that advertises one.
 *
 * Runs from the `version` npm script, which changesets/action invokes when it
 * builds the release PR, so these versions are generated alongside the
 * CHANGELOG rather than hand-bumped and forgotten. None of these files ships in
 * the npm tarball, so nothing else would ever catch them going stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { syncVersion } from './sync-release-versions-core.js';

const MANIFESTS = [
  'server.json',
  'plugins/agentsmesh-lessons/plugin.json',
  'plugins/agentsmesh-lessons/.claude-plugin/plugin.json',
];

const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  version: string;
};

const updated: string[] = [];
for (const relativePath of MANIFESTS) {
  const path = resolve(relativePath);
  const before = readFileSync(path, 'utf8');
  const after = syncVersion(before, version);
  if (after === before) continue;
  writeFileSync(path, after);
  updated.push(relativePath);
}

process.stdout.write(
  updated.length === 0
    ? `sync-release-versions OK: every manifest is already at ${version}.\n`
    : `sync-release-versions: set ${version} in ${updated.join(', ')}.\n`,
);
