import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CURRENT_GRAPH_VERSION, LessonsGraphSchema } from '../../src/lessons/graph-schema.js';
import { LESSONS_USAGE, LESSONS_SUBCOMMANDS } from '../../src/cli/commands/lessons-usage.js';
import { LESSONS_KNOWN_FLAGS, GLOBAL_FLAGS } from '../../src/cli/commands/lessons-known-flags.js';
import { LESSONS_TOOL_DESCRIPTORS } from '../../src/mcp/tool-tables/lessons-tools.js';

/**
 * FROZEN end-user API contract for the lessons subsystem.
 *
 * The lessons-effectiveness work (outcome log, diff-aware recall, capture nudge,
 * validate health view) must not move the public surface: the on-disk graph
 * schema + version, the CLI subcommands/flags/usage signatures, and the MCP tool
 * names/descriptions/input schemas. This test snapshots that entire surface to a
 * committed golden — any drift fails, so it is the gate every later slice keeps green.
 */

const jsonSchema = (s: z.ZodType): unknown => z.toJSONSchema(s, { unrepresentable: 'any' });

/** The complete frozen end-user surface of the lessons subsystem. */
export function lessonsFrozenSurface(): unknown {
  return {
    graphVersion: CURRENT_GRAPH_VERSION,
    graphSchema: jsonSchema(LessonsGraphSchema),
    subcommands: [...LESSONS_SUBCOMMANDS],
    usage: LESSONS_USAGE,
    globalFlags: [...GLOBAL_FLAGS],
    knownFlags: LESSONS_KNOWN_FLAGS,
    mcpTools: LESSONS_TOOL_DESCRIPTORS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema),
    })),
  };
}

describe('lessons frozen end-user API (contract)', () => {
  it('pins the graph version, the 14 CLI subcommands, and the 5 MCP tools by name', () => {
    expect(CURRENT_GRAPH_VERSION).toBe(2);
    expect([...LESSONS_SUBCOMMANDS]).toEqual([
      'query',
      'add',
      'topics',
      'show',
      'deprecate',
      'merge',
      'untrigger',
      'strip-markers',
      'journal',
      'validate',
      'resolve',
      'stats',
      'prune',
      'import-md',
    ]);
    expect(LESSONS_TOOL_DESCRIPTORS.map((t) => t.name)).toEqual([
      'lessons_query',
      'lessons_add',
      'lessons_topics',
      'lessons_show',
      'lessons_deprecate',
    ]);
  });

  it('keeps the full surface byte-identical to the committed golden', async () => {
    await expect(JSON.stringify(lessonsFrozenSurface(), null, 2) + '\n').toMatchFileSnapshot(
      './__golden__/lessons-frozen-api.json',
    );
  });
});
