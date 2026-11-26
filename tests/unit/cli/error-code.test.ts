import { describe, expect, it } from 'vitest';
import { errorCode } from '../../../src/cli/error-code.js';

class CodedError extends Error {
  readonly code = 'SOME_CODE';
}

describe('errorCode', () => {
  it('returns the string code of a thrown error', () => {
    expect(errorCode(new CodedError('x'))).toBe('SOME_CODE');
  });

  it('returns undefined for an error without a code', () => {
    expect(errorCode(new Error('x'))).toBeUndefined();
  });

  it('returns undefined for an empty or non-string code', () => {
    expect(errorCode(Object.assign(new Error('x'), { code: '' }))).toBeUndefined();
    expect(errorCode(Object.assign(new Error('x'), { code: 42 }))).toBeUndefined();
  });

  it('returns undefined for values that are not errors', () => {
    expect(errorCode('boom')).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
    expect(errorCode({ code: 'SOME_CODE' })).toBeUndefined();
  });

  it('ignores Node system error codes such as ENOENT', () => {
    const sys = Object.assign(new Error('open failed'), {
      code: 'ENOENT',
      errno: -2,
      syscall: 'open',
    });
    expect(errorCode(sys)).toBeUndefined();
  });
});
