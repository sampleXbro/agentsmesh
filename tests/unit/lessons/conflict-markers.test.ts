import { describe, expect, it } from 'vitest';
import { hasConflictMarkers, splitConflictSides } from '../../../src/lessons/conflict-markers.js';

const MERGE = [
  '{',
  '<<<<<<< HEAD',
  '  "a": 1',
  '=======',
  '  "a": 2',
  '>>>>>>> feature',
  '}',
  '',
].join('\n');

const DIFF3 = [
  'top',
  '<<<<<<< HEAD',
  'ours',
  '||||||| base',
  'orig',
  '=======',
  'theirs',
  '>>>>>>> feature',
  'mid',
  '<<<<<<< HEAD',
  'o2',
  '||||||| base',
  'b2',
  '=======',
  't2',
  '>>>>>>> feature',
  '',
].join('\n');

describe('hasConflictMarkers', () => {
  it('detects a git conflict block', () => {
    expect(hasConflictMarkers(MERGE)).toBe(true);
  });

  it('detects markers in a CRLF file', () => {
    expect(hasConflictMarkers(MERGE.replaceAll('\n', '\r\n'))).toBe(true);
  });

  it('detects a block left half-open by a hand edit', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD\n{}\n=======\n{}\n')).toBe(true);
  });

  it('ignores plain JSON and marker-like text inside a line', () => {
    expect(hasConflictMarkers('{ "rule": "never write <<<<<<< HEAD by hand" }\n')).toBe(false);
    expect(hasConflictMarkers('{}\n')).toBe(false);
  });
});

describe('splitConflictSides', () => {
  it('rebuilds each side of a two-way conflict, with no base', () => {
    expect(splitConflictSides(MERGE)).toEqual({
      base: null,
      ours: '{\n  "a": 1\n}\n',
      theirs: '{\n  "a": 2\n}\n',
    });
  });

  it('rebuilds the base too from diff3-style markers, across several blocks', () => {
    expect(splitConflictSides(DIFF3)).toEqual({
      base: 'top\norig\nmid\nb2\n',
      ours: 'top\nours\nmid\no2\n',
      theirs: 'top\ntheirs\nmid\nt2\n',
    });
  });

  it('keeps CRLF line endings on every side', () => {
    const sides = splitConflictSides(MERGE.replaceAll('\n', '\r\n'));
    expect(sides?.ours).toBe('{\r\n  "a": 1\r\n}\r\n');
    expect(sides?.theirs).toBe('{\r\n  "a": 2\r\n}\r\n');
  });

  it('returns null when there is no conflict or a block is left open', () => {
    expect(splitConflictSides('{}\n')).toBeNull();
    expect(splitConflictSides('<<<<<<< HEAD\nours\n=======\ntheirs\n')).toBeNull();
  });
});
