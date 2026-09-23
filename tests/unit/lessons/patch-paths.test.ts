import { describe, expect, it } from 'vitest';
import { patchFromToolInput, parsePatch } from '../../../src/lessons/patch-paths.js';

const PATCH = [
  '*** Begin Patch',
  '*** Update File: db/migrations/001.sql',
  '@@ create table',
  '-old line',
  '+ALTER TABLE users ADD COLUMN redos_guard int;',
  '*** Add File: src/new.ts',
  '+export const x = 1;',
  '*** Delete File: src/old.ts',
  '*** Update File: src/a.ts',
  '*** Move to: src/b.ts',
  '@@',
  '+moved',
  '*** Update File: db/migrations/001.sql',
  '*** End Patch',
].join('\n');

describe('parsePatch', () => {
  it('extracts Add, Update, Delete and Move-to paths in order, deduplicated', () => {
    expect(parsePatch(PATCH).paths).toEqual([
      'db/migrations/001.sql',
      'src/new.ts',
      'src/old.ts',
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('collects the added (+) lines without their prefix', () => {
    expect(parsePatch(PATCH).added).toBe(
      'ALTER TABLE users ADD COLUMN redos_guard int;\nexport const x = 1;\nmoved',
    );
  });

  it('handles CRLF line endings and trailing spaces on header lines', () => {
    const crlf = '*** Begin Patch\r\n*** Update File: src/x.ts  \r\n+y\r\n*** End Patch\r\n';
    expect(parsePatch(crlf)).toEqual({ paths: ['src/x.ts'], added: 'y' });
  });
});

describe('patchFromToolInput', () => {
  it('reads a patch from tool_input.command for apply_patch', () => {
    expect(patchFromToolInput('apply_patch', { command: PATCH })?.paths[0]).toBe(
      'db/migrations/001.sql',
    );
  });

  it('reads a patch from tool_input.patch', () => {
    expect(patchFromToolInput('apply_patch', { patch: PATCH })?.paths.length).toBe(5);
  });

  it('detects a patch under an Edit alias by its Begin Patch marker', () => {
    expect(patchFromToolInput('Edit', { command: PATCH })?.paths.length).toBe(5);
  });

  it('accepts file headers without a Begin marker only when the tool is apply_patch', () => {
    const bare = '*** Update File: src/x.ts\n+y';
    expect(patchFromToolInput('apply_patch', { command: bare })?.paths).toEqual(['src/x.ts']);
    expect(patchFromToolInput('Bash', { command: bare })).toBeNull();
  });

  it('returns null for an ordinary shell command', () => {
    expect(patchFromToolInput('Bash', { command: 'npx vitest run' })).toBeNull();
    expect(patchFromToolInput(undefined, null)).toBeNull();
  });

  it('returns null for a patch that names no file', () => {
    expect(
      patchFromToolInput('apply_patch', { command: '*** Begin Patch\n*** End Patch' }),
    ).toBeNull();
  });
});
