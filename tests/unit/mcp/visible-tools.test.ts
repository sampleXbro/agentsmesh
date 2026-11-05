/**
 * Outside an agentsmesh project only the lessons tools work, so only they are
 * listed. Listing the config tools there cost every client context for tools
 * that could only answer NO_PROJECT.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESOURCE_DESCRIPTORS, TOOL_DESCRIPTORS } from '../../../src/mcp/register.js';
import { visibleResources, visibleTools } from '../../../src/mcp/visible-tools.js';

const LESSONS_TOOLS = [
  'lessons_query',
  'lessons_add',
  'lessons_topics',
  'lessons_show',
  'lessons_deprecate',
];

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'am-mcp-visible-')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const names = (list: readonly { name: string }[]): string[] => list.map((d) => d.name);

describe('outside an agentsmesh project', () => {
  it('lists only the lessons tools in a git repository', async () => {
    mkdirSync(join(dir, '.git'));

    expect(names(await visibleTools(dir))).toEqual(LESSONS_TOOLS);
  });

  it('lists only the lessons tools in a plain folder', async () => {
    expect(names(await visibleTools(dir))).toEqual(LESSONS_TOOLS);
  });

  it('lists no resources, since every one reads project config', async () => {
    expect(await visibleResources(dir)).toEqual([]);
  });

  it('lists every tool once a project is created, with no restart', async () => {
    expect(names(await visibleTools(dir))).toEqual(LESSONS_TOOLS);

    writeFileSync(join(dir, 'agentsmesh.yaml'), 'version: 1\ntargets: []\nfeatures: []\n');

    expect(names(await visibleTools(dir))).toEqual(names(TOOL_DESCRIPTORS));
  });
});

describe('inside an agentsmesh project', () => {
  beforeEach(() => {
    writeFileSync(join(dir, 'agentsmesh.yaml'), 'version: 1\ntargets: []\nfeatures: []\n');
  });

  it('lists every tool and resource at the project root', async () => {
    expect(names(await visibleTools(dir))).toEqual(names(TOOL_DESCRIPTORS));
    expect(names(await visibleResources(dir))).toEqual(names(RESOURCE_DESCRIPTORS));
  });

  it('lists every tool from a subfolder', async () => {
    const pkg = join(dir, 'packages', 'app');
    mkdirSync(pkg, { recursive: true });

    expect(names(await visibleTools(pkg))).toEqual(names(TOOL_DESCRIPTORS));
  });
});
