/**
 * Branch coverage for src/cli/commands/seed-mcp-entry.ts:
 * - A file the seeder declines to rewrite (unreadable/commented) is preserved.
 * - Outer catch when the write phase fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedAgentsmeshMcpEntry } from '../../../../src/cli/commands/seed-mcp-entry.js';

let tempDir: string;
let stderr: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'am-seed-mcp-branch-'));
  stderr = '';
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('seedAgentsmeshMcpEntry — fallback branches', () => {
  it('preserves a file it cannot rewrite instead of replacing it', async () => {
    // Previously this fell back to an empty document and wrote it, so one bad
    // character cost the user every server they had declared.
    mkdirSync(join(tempDir, '.agentsmesh'), { recursive: true });
    const broken = '{ "mcpServers": { "mine": { "command": "node" } },, }';
    writeFileSync(join(tempDir, '.agentsmesh', 'mcp.json'), broken);

    const wrote = await seedAgentsmeshMcpEntry(tempDir);

    expect(wrote).toBe(false);
    expect(readFileSync(join(tempDir, '.agentsmesh', 'mcp.json'), 'utf8')).toBe(broken);
    expect(stderr).toContain('not valid JSON');
  });

  it('logs warning to stderr and returns false when write phase throws (outer catch with Error)', async () => {
    // .agentsmesh exists as a *file* — mkdir(..., { recursive: true }) on a
    // path whose parent is a file rejects with ENOTDIR, exercising the outer
    // catch branch where `e instanceof Error` is true.
    writeFileSync(join(tempDir, '.agentsmesh'), 'not-a-dir');
    const wrote = await seedAgentsmeshMcpEntry(tempDir);
    expect(wrote).toBe(false);
    expect(stderr).toContain('warning: could not seed agentsmesh MCP server entry');
  });

  it('creates the document when the file is missing, with no warning', async () => {
    // Happy path: nothing on disk → a fresh document is written.
    const wrote = await seedAgentsmeshMcpEntry(tempDir);
    expect(wrote).toBe(true);
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
