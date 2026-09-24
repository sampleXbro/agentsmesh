import { describe, expect, it } from 'vitest';
import { errorClass } from '../../../src/lessons/error-class.js';

describe('errorClass', () => {
  it('returns undefined for absent or blank text', () => {
    expect(errorClass(undefined)).toBeUndefined();
    expect(errorClass('')).toBeUndefined();
    expect(errorClass('  \n  \t ')).toBeUndefined();
  });

  it('takes the first non-empty line, lowercased', () => {
    expect(errorClass('\nTypeError: boom\n  at foo (x.ts)')).toBe('typeerror: boom');
  });

  it('collapses volatile line:col numbers so the class is stable run to run', () => {
    expect(errorClass('Error at 42:7')).toBe(errorClass('Error at 9:1'));
  });

  it('collapses quoted paths and hex addresses so two runs share one class', () => {
    expect(errorClass("Cannot find module '/abs/a.ts'")).toBe(
      errorClass("Cannot find module '/other/b.ts'"),
    );
    expect(errorClass('segfault at 0x7ffee1a2')).toBe(errorClass('segfault at 0xdeadbeef'));
  });

  it('caps the class length', () => {
    expect(errorClass('e'.repeat(500))!.length).toBeLessThanOrEqual(MAX_ERROR_CLASS_FOR_TEST);
  });

  it('collapses unquoted paths and commit hashes so two runs share one class', () => {
    expect(errorClass('ENOENT: no such file or directory, open /repo/a.ts')).toBe(
      'enoent: no such file or directory, open …',
    );
    expect(errorClass('src/x.ts(3,1): error TS2322: bad')).toBe(
      errorClass('src/y.ts(9,4): error TS2322: bad'),
    );
    expect(errorClass('fatal: bad object 7589475d')).toBe(errorClass('fatal: bad object a7861bd0'));
    expect(errorClass('decade facade')).toBe('decade facade');
  });

  it('strips ANSI colour codes', () => {
    expect(errorClass('\u001b[31mTypeError: boom\u001b[39m')).toBe('typeerror: boom');
  });
});

describe('errorClass — shell `Exit code N` header', () => {
  it('classes on the first meaningful line after the header', () => {
    expect(errorClass("Exit code 1\nError: Cannot find module 'express'")).toBe(
      'error: cannot find module …',
    );
  });

  it('keeps two different Bash failures apart', () => {
    const a = errorClass('Exit code 1\nfatal: not a git repository');
    const b = errorClass("Exit code 1\nError: Cannot find module 'x'");
    expect(a).not.toBe(b);
  });

  it('skips blank lines, symbol-only lines and package-manager script banners', () => {
    const text =
      'Exit code 2\n\n> agentsmesh@0.40.0 typecheck /repo\n> tsc --noEmit\n----\nsrc/x.ts(1,1): error TS1005: expected';
    expect(errorClass(text)).toBe('… error ts…: expected');
  });

  it('falls back to the header when nothing follows it', () => {
    expect(errorClass('Exit code 127')).toBe('exit code …');
  });
});

const MAX_ERROR_CLASS_FOR_TEST = 120;
