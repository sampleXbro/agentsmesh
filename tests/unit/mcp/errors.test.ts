import { describe, it, expect } from 'vitest';
import { McpError, redactAbsolutePaths } from '../../../src/mcp/errors.js';

describe('errors', () => {
  it('serializes to envelope with code/message/details', () => {
    const e = new McpError('NOT_FOUND', 'rule "auth" not found', { name: 'auth' });
    expect(e.toEnvelope()).toEqual({
      code: 'NOT_FOUND',
      message: 'rule "auth" not found',
      details: { name: 'auth' },
    });
  });
  it('refuses absolute fs paths in messages', () => {
    expect(() => new McpError('IO_ERROR', '/Users/x/y failed')).toThrow(/absolute fs path/);
  });
});

describe('redactAbsolutePaths', () => {
  it('redacts a POSIX absolute path mid-message', () => {
    const out = redactAbsolutePaths(
      "ENOENT: no such file or directory, open '/Users/serhii/secret.json'",
    );
    expect(out).not.toContain('/Users/serhii/secret.json');
    expect(out).toContain('<redacted>');
  });

  it('redacts a Windows absolute path', () => {
    const out = redactAbsolutePaths('failed C:\\Users\\bob\\AppData\\file.txt');
    expect(out).not.toContain('C:\\Users\\bob');
    expect(out).toContain('<redacted>');
  });

  it('leaves non-path content untouched', () => {
    expect(redactAbsolutePaths('error: name is invalid')).toBe('error: name is invalid');
  });

  it('redacts a single-quoted absolute path (Node ENOENT format)', () => {
    const out = redactAbsolutePaths(
      "ENOENT: no such file or directory, open '/Users/secret/file.json'",
    );
    expect(out).not.toContain('/Users/secret');
    expect(out).toContain('<redacted>');
  });

  it('redacts a path at the very start of the message', () => {
    const out = redactAbsolutePaths('/Users/dev/.ssh/id_rsa is missing');
    expect(out).not.toContain('/Users/dev/.ssh/id_rsa');
    expect(out).toContain('<redacted>');
  });
});
