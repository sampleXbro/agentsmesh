/**
 * `lessons_query {always:true}` honors `session` and `no_dedup` exactly like
 * triggered recall. `no_dedup` is the documented escape after the client
 * compacts its context; ignoring it for the universal lessons left them hidden
 * with no way back until the server restarted.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';

let root: string;
let ctx: McpContext;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mcp-always-'));
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
  saveLessonsGraph(root, {
    version: 2,
    lessons: {
      universal: {
        rule: 'Keep comments short.',
        topics: ['style'],
        triggers: [],
        evidence: [],
        status: 'active',
        scope: 'always',
        createdAt: '2026-06-01',
      },
    },
    topics: { style: { summary: 'Style.' } },
    triggers: {},
  });
  ctx = { projectRoot: root } as McpContext;
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const UNIVERSAL = [{ id: 'universal', rule: 'Keep comments short.' }];

describe('lessons_query always:true — session dedup controls', () => {
  it('suppresses a repeat within the session and counts it', async () => {
    expect((await lessonsHandlers.query(ctx, { always: true })).lessons).toEqual(UNIVERSAL);
    const again = await lessonsHandlers.query(ctx, { always: true });
    expect(again.lessons).toEqual([]);
    expect(again.suppressed).toBe(1);
  });

  it('no_dedup returns the universal lessons again', async () => {
    await lessonsHandlers.query(ctx, { always: true });
    const r = await lessonsHandlers.query(ctx, { always: true, no_dedup: true });
    expect(r.lessons).toEqual(UNIVERSAL);
    expect(r.suppressed).toBeUndefined();
  });

  it("accepts the CLI-flag alias 'no-dedup'", async () => {
    await lessonsHandlers.query(ctx, { always: true });
    const r = await lessonsHandlers.query(ctx, { always: true, 'no-dedup': true });
    expect(r.lessons).toEqual(UNIVERSAL);
  });

  it('an explicit session scopes dedup to that session', async () => {
    await lessonsHandlers.query(ctx, { always: true });
    expect((await lessonsHandlers.query(ctx, { always: true, session: 'fresh' })).lessons).toEqual(
      UNIVERSAL,
    );
    const repeat = await lessonsHandlers.query(ctx, { always: true, session: 'fresh' });
    expect(repeat.lessons).toEqual([]);
    expect(repeat.suppressed).toBe(1);
  });

  it('session "auto" is the default server session', async () => {
    await lessonsHandlers.query(ctx, { always: true });
    const r = await lessonsHandlers.query(ctx, { always: true, session: 'auto' });
    expect(r.lessons).toEqual([]);
    expect(r.suppressed).toBe(1);
  });
});
