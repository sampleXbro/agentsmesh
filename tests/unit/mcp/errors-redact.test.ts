/**
 * Security: `redactAbsolutePaths` must strip filesystem paths anywhere in the
 * string, not only at line start or after whitespace. Embedded paths leak the
 * host directory layout to remote MCP clients.
 */
import { describe, it, expect } from 'vitest';
import { redactAbsolutePaths } from '../../../src/mcp/errors.js';

describe('redactAbsolutePaths — global stripping', () => {
  it('strips an embedded POSIX path with no leading whitespace', () => {
    const out = redactAbsolutePaths('Error: ENOENT, open /Users/dev/.ssh/id_rsa');
    expect(out).not.toContain('/Users/dev');
  });

  it('strips a path right after a colon', () => {
    const out = redactAbsolutePaths('failure at file:/Users/dev/project/x.ts');
    expect(out).not.toContain('/Users/dev');
  });

  it('strips a stack-frame embedded path', () => {
    const out = redactAbsolutePaths('at Object.<anonymous> (/Users/dev/proj/foo.js:12:3)');
    expect(out).not.toContain('/Users/dev');
  });

  it('strips a Windows path embedded mid-string', () => {
    const out = redactAbsolutePaths('failure at C:\\Users\\dev\\proj\\x.ts');
    expect(out).not.toContain('C:\\Users');
  });

  it('strips a quoted path', () => {
    const out = redactAbsolutePaths("ENOENT: '/Users/dev/secret.env'");
    expect(out).not.toContain('/Users/dev');
  });

  it('leaves a path-free message intact', () => {
    expect(redactAbsolutePaths('plain message')).toBe('plain message');
  });

  it('strips a path after a file URL scheme', () => {
    const out = redactAbsolutePaths('at file:///Users/dev/proj/x.js:3:1');
    expect(out).not.toContain('/Users/dev');
  });

  it('strips a path after an equals sign, a bracket, or an unclosed quote', () => {
    for (const raw of ['cwd=/Users/dev/x', '[/Users/dev/x]', "open '/Users/dev/x"]) {
      expect(redactAbsolutePaths(raw)).not.toContain('/Users/dev');
    }
  });

  it('keeps a slash inside a word, which is prose or a relative path, not a host path', () => {
    const prose = 'no backreference/lookaround; push origin/main; edit src/cli/x.ts';
    expect(redactAbsolutePaths(prose)).toBe(prose);
  });
});
