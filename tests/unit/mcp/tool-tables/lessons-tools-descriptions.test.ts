import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LESSONS_TOOL_DESCRIPTORS } from '../../../../src/mcp/tool-tables/lessons-tools.js';

/**
 * MCP agents never see the CLI: tool text must use MCP words (`details.code`,
 * field names) and the real defaults, not CLI exit codes or flag names.
 */

function descriptor(name: string): (typeof LESSONS_TOOL_DESCRIPTORS)[number] {
  const d = LESSONS_TOOL_DESCRIPTORS.find((x) => x.name === name);
  if (d === undefined) throw new Error(`${name} descriptor missing`);
  return d;
}

function fieldDescription(name: string, field: string): string {
  const schema = z.toJSONSchema(descriptor(name).inputSchema, { unrepresentable: 'any' }) as {
    properties: Record<string, { description?: string }>;
  };
  return schema.properties[field]?.description ?? '';
}

describe('lessons_add description', () => {
  const text = descriptor('lessons_add').description;

  it('names the MCP error shape: VALIDATION_FAILED with details.code', () => {
    expect(text).toContain('VALIDATION_FAILED');
    expect(text).toContain('details.code');
    expect(text).toContain('UNRECALLABLE_LESSON');
  });

  it('does not talk about CLI exit codes', () => {
    expect(text).not.toMatch(/exit \d/i);
  });

  it('says an unknown topic is NOT_FOUND', () => {
    expect(text).toContain('NOT_FOUND');
    expect(text).toContain('UNKNOWN_TOPIC');
  });

  it('lists the catch-all file glob refusal in MCP words, with the way out', () => {
    expect(text).toContain(
      'a catch-all file glob such as `**/*` (CATCH_ALL_GLOB; use `scope: "always"` for a rule that applies to every task)',
    );
    expect(text).not.toContain('--scope');
  });
});

describe('lessons_topics description', () => {
  const text = descriptor('lessons_topics').description;

  it('points at the `topic` field of lessons_add, not a CLI flag', () => {
    expect(text).not.toContain('--topic');
    expect(text).toContain('`topic`');
    expect(text).toContain('lessons_add');
  });
});

describe('lessons_query limit', () => {
  const limit = fieldDescription('lessons_query', 'limit');
  const tool = descriptor('lessons_query').description;

  it('names the real default: recallLimit from config.json, else 10', () => {
    expect(limit).toContain('recallLimit');
    expect(limit).toContain('.agentsmesh/lessons/config.json');
    expect(limit).toContain('10');
  });

  it('does not claim a fixed default of 10', () => {
    expect(limit).not.toMatch(/\(default 10\)/);
    expect(tool).not.toMatch(/\(default 10\)/);
  });
});

describe('lessons_query description', () => {
  it('says an unreadable graph returns a `warning` instead of looking like no match', () => {
    const text = descriptor('lessons_query').description;
    expect(text).toContain('`warning`');
  });

  it('names a failed legacy migration among the causes of that warning', () => {
    const text = descriptor('lessons_query').description;
    expect(text).toContain('(merge conflict, corrupt JSON, newer schema, failed legacy migration)');
  });
});
