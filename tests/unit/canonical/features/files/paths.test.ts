import { describe, it, expect } from 'vitest';
import { assertSafeCopiedFilePath, isForbiddenOutputPath } from '../../../../../src/canonical/features/files/paths.js';

describe('copied file paths', () => {
  it('accepts project-root relative POSIX paths', () => {
    expect(assertSafeCopiedFilePath('.gitignore')).toBe('.gitignore');
    expect(assertSafeCopiedFilePath('.github/workflows/ci.yml')).toBe('.github/workflows/ci.yml');
  });

  it('rejects traversal, absolute, and backslash paths', () => {
    expect(() => assertSafeCopiedFilePath('../secret')).toThrow(/'\.\.'/);
    expect(() => assertSafeCopiedFilePath('/etc/passwd')).toThrow(/absolute/);
    expect(() => assertSafeCopiedFilePath('a\\b')).toThrow(/backslash/);
  });

  it('rejects reserved destinations', () => {
    expect(isForbiddenOutputPath('.agentsmesh/rules/x.md')).toBe(true);
    expect(isForbiddenOutputPath('.git/config')).toBe(true);
    expect(isForbiddenOutputPath('agentsmesh.yaml')).toBe(true);
    expect(() => assertSafeCopiedFilePath('.agentsmesh/mcp.json')).toThrow(/reserved/);
  });
});
