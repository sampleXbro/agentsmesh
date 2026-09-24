import { describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { McpError } from '../../../../src/mcp/errors.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';

// Capture itself is covered elsewhere; this pins only the handler's error mapping.
vi.mock('../../../../src/lessons/capture.js', async () => {
  const { TriggerFileGlobError } = await import('../../../../src/lessons/trigger-file-glob.js');
  return {
    captureLesson: vi.fn(async () => {
      throw new TriggerFileGlobError('/somewhere-else/**/*.ts');
    }),
  };
});

describe('lessons_add with a file trigger outside the project', () => {
  it('is VALIDATION_FAILED with the TRIGGER_FILE_OUTSIDE_PROJECT machine code', async () => {
    const ctx = { projectRoot: '/project' } as McpContext;
    const err = await lessonsHandlers
      .add(ctx, { rule: 'Outside rule.', topic: 't', trigger_files: ['/somewhere-else/**/*.ts'] })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe('VALIDATION_FAILED');
    expect((err as McpError).message).toContain('outside the project root');
    expect(((err as McpError).details as { code?: string }).code).toBe(
      'TRIGGER_FILE_OUTSIDE_PROJECT',
    );
  });
});
