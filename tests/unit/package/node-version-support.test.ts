import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
}

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const NODE_FLOOR = '20.19.0';
const NODE_FLOOR_LABEL = 'Node.js 20.19';
const NODE_REQUIREMENT_DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'website/src/components/SoftwareApplicationJsonLd.astro',
  'website/src/content/data/home.ts',
  'website/src/content/docs/getting-started/installation.mdx',
  'website/src/content/docs/reference/programmatic-api.mdx',
  'website/src/lib/install-command.mjs',
];

function readText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8').replace(/\r\n/g, '\n');
}

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readText(relativePath)) as PackageJson;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Unparseable ranges count as too new so a human checks them.
function needsNewerNode(range: string): boolean {
  const min = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(range.trim())?.[1];
  return min === undefined || compareVersions(min, NODE_FLOOR) > 0;
}

describe('Node.js version support', () => {
  it('declares the supported Node floor in engines', () => {
    expect(readPackageJson('package.json').engines).toEqual({ node: `>=${NODE_FLOOR}` });
  });

  it('has no runtime dependency that needs a newer Node than the floor', () => {
    const deps = Object.keys(readPackageJson('package.json').dependencies ?? {});
    const tooNew = deps.flatMap((dep) => {
      const range = readPackageJson(`node_modules/${dep}/package.json`).engines?.node;
      return range !== undefined && needsNewerNode(range) ? [`${dep}: ${range}`] : [];
    });

    expect(tooNew).toEqual([]);
  });

  it('tests the floor major in the CI quality matrix', () => {
    expect(readText('.github/workflows/ci.yml')).toContain(`- os: ubuntu-latest
            node-version: ${NODE_FLOOR.split('.')[0]}
`);
  });

  it.each(NODE_REQUIREMENT_DOCS)('%s states the same Node floor', (doc) => {
    const text = readText(doc);

    expect(text).toContain(NODE_FLOOR_LABEL);
    expect(text).not.toMatch(/Node\.js 20(?!\.19)\b/);
  });
});
