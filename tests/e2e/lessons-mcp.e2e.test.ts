/**
 * E2E: the lessons MCP tools (`lessons_query`, `lessons_add`, `lessons_topics`)
 * driven over stdio against the real `agentsmesh mcp` server.
 *
 * Mirrors the manual QA pass: read tools on an empty graph, the capture
 * lifecycle (add → idempotent re-add → recall round-trip), and the
 * no-mutation error paths (unknown topic, new topic without summary).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import {
  createInitedProject,
  parseToolText,
  spawnMcpServer,
  type McpServer,
} from './helpers/mcp-client.js';

interface AddResult {
  id: string;
  isNewLesson: boolean;
  isNewTopic: boolean;
  newTriggerIds: string[];
}

interface QueryResult {
  lessons: Array<{ id: string; rule: string; triggers?: string[]; evidence?: string[] }>;
  totalMatches: number;
}

interface TopicsResult {
  topics: Array<{ id: string; summary: string }>;
}

describe('lessons MCP tools — discovery + reads on an empty graph', () => {
  let dir = '';
  let server: McpServer;

  beforeAll(async () => {
    dir = createInitedProject();
    server = await spawnMcpServer(dir);
  });

  afterAll(async () => {
    await server.dispose();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('exposes lessons_query / lessons_add / lessons_topics as live tools', async () => {
    const { tools } = await server.client.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has('lessons_query')).toBe(true);
    expect(names.has('lessons_add')).toBe(true);
    expect(names.has('lessons_topics')).toBe(true);
  });

  it('lessons_topics returns an empty list when no graph exists', async () => {
    const result = await server.client.callTool({ name: 'lessons_topics', arguments: {} });
    const data = parseToolText(result) as TopicsResult;
    expect(data.topics).toEqual([]);
  });

  it('lessons_query returns no matches (no error) when no graph exists', async () => {
    const result = await server.client.callTool({
      name: 'lessons_query',
      arguments: { keyword: 'anything' },
    });
    const data = parseToolText(result) as QueryResult;
    expect(data).toEqual({ lessons: [], totalMatches: 0 });
  });
});

describe('lessons MCP tools — capture lifecycle', () => {
  let dir = '';
  let server: McpServer;

  beforeAll(async () => {
    dir = createInitedProject();
    server = await spawnMcpServer(dir);
  });

  afterAll(async () => {
    await server.dispose();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('add (new topic) → idempotent re-add → recall round-trips triggers + evidence', async () => {
    const addResult = await server.client.callTool({
      name: 'lessons_add',
      arguments: {
        rule: 'E2E MCP capture round-trips triggers and evidence',
        topic: 'e2e-mcp',
        new_topic: true,
        topic_summary: 'E2E MCP lessons coverage',
        trigger_keywords: ['e2e-mcp-kw'],
        evidence: ['lesson:e2e-mcp'],
      },
    });
    const added = parseToolText(addResult) as AddResult;
    expect(added.isNewLesson).toBe(true);
    expect(added.isNewTopic).toBe(true);
    expect(added.newTriggerIds).toHaveLength(1);

    // Idempotent re-add: same rule+topic, one duplicate kw + one new kw.
    const reAddResult = await server.client.callTool({
      name: 'lessons_add',
      arguments: {
        rule: 'E2E MCP capture round-trips triggers and evidence',
        topic: 'e2e-mcp',
        trigger_keywords: ['e2e-mcp-kw', 'e2e-mcp-kw-2'],
      },
    });
    const reAdded = parseToolText(reAddResult) as AddResult;
    expect(reAdded.id).toBe(added.id);
    expect(reAdded.isNewLesson).toBe(false);
    // Only the genuinely new keyword is added; the duplicate is deduped.
    expect(reAdded.newTriggerIds).toHaveLength(1);

    // The new topic now shows up.
    const topicsResult = await server.client.callTool({ name: 'lessons_topics', arguments: {} });
    const topics = parseToolText(topicsResult) as TopicsResult;
    expect(topics.topics).toContainEqual({ id: 'e2e-mcp', summary: 'E2E MCP lessons coverage' });

    // Recall round-trips both keyword triggers + the evidence.
    const queryResult = await server.client.callTool({
      name: 'lessons_query',
      arguments: { keyword: 'e2e-mcp-kw', verbose: true },
    });
    const queried = parseToolText(queryResult) as QueryResult;
    expect(queried.totalMatches).toBe(1);
    expect(queried.lessons[0]?.id).toBe(added.id);
    expect(queried.lessons[0]?.triggers).toHaveLength(2);
    expect(queried.lessons[0]?.evidence).toContain('lesson:e2e-mcp');
  });
});

describe('lessons MCP tools — no-mutation error paths', () => {
  let dir = '';
  let server: McpServer;

  beforeAll(async () => {
    dir = createInitedProject();
    server = await spawnMcpServer(dir);
  });

  afterAll(async () => {
    await server.dispose();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('lessons_add to an unknown topic errors and mutates nothing', async () => {
    const result = await server.client.callTool({
      name: 'lessons_add',
      arguments: { rule: 'should be rejected', topic: 'no-such-mcp-topic' },
    });
    expect(result.isError).toBe(true);
    const data = parseToolText(result) as { code: string; message: string };
    expect(data.code).toBe('NOT_FOUND');
    expect(data.message).toContain('unknown topic');

    // No graph/topic was created by the failed add.
    const topicsResult = await server.client.callTool({ name: 'lessons_topics', arguments: {} });
    const topics = parseToolText(topicsResult) as TopicsResult;
    expect(topics.topics).toEqual([]);
  });

  it('lessons_add with new_topic but no topic_summary is VALIDATION_FAILED', async () => {
    const result = await server.client.callTool({
      name: 'lessons_add',
      arguments: { rule: 'missing summary', topic: 'brand-new-mcp-topic', new_topic: true },
    });
    expect(result.isError).toBe(true);
    const data = parseToolText(result) as { code: string; message: string };
    expect(data.code).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('topic_summary over MCP');
  });

  it('lessons_query with no predicate is VALIDATION_FAILED (not IO_ERROR)', async () => {
    const result = await server.client.callTool({ name: 'lessons_query', arguments: {} });
    expect(result.isError).toBe(true);
    const data = parseToolText(result) as { code: string; message: string };
    expect(data.code).toBe('VALIDATION_FAILED');
    expect(data.message).toContain('at least one of file, command, keyword');
  });

  it('lessons_add capture guardrail (no trigger) is VALIDATION_FAILED with NO_TRIGGER detail', async () => {
    // Seed a real topic so the failure is the trigger guardrail, not unknown-topic.
    await server.client.callTool({
      name: 'lessons_add',
      arguments: {
        rule: 'A seeded rule.',
        topic: 'guardrail-topic',
        topic_summary: 'Guardrail topic.',
        new_topic: true,
        trigger_file: 'src/**/*.ts',
      },
    });
    const result = await server.client.callTool({
      name: 'lessons_add',
      arguments: { rule: 'No trigger at all.', topic: 'guardrail-topic' },
    });
    expect(result.isError).toBe(true);
    const data = parseToolText(result) as { code: string; details?: { code?: string } };
    expect(data.code).toBe('VALIDATION_FAILED');
    expect(data.details?.code).toBe('NO_TRIGGER');
  });
});
