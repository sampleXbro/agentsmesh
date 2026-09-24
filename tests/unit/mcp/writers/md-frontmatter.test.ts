import { describe, it, expect } from 'vitest';
import { parseMd, serializeMd } from '../../../../src/mcp/writers/md-frontmatter.js';

describe('md-frontmatter', () => {
  it('round-trips frontmatter + body', () => {
    const src = '---\nname: foo\ndescription: x\n---\n\nbody here\n';
    const parsed = parseMd(src);
    expect(parsed.frontmatter).toEqual({ name: 'foo', description: 'x' });
    expect(parsed.body).toBe('body here\n');
    expect(serializeMd(parsed.frontmatter, parsed.body)).toBe(src);
  });
  it('handles missing frontmatter', () => {
    expect(parseMd('plain body\n')).toEqual({ frontmatter: {}, body: 'plain body\n' });
  });
  it('writes an empty block before a body that starts with ---, and reads it back', () => {
    const body = '---\nroot: true\n---\nBODY\n';
    const src = serializeMd({}, body);

    expect(src).toBe(`---\n---\n\n${body}`);
    expect(parseMd(src)).toEqual({ frontmatter: {}, body });
  });
  it('reads an empty block and a closer at the end of the file', () => {
    expect(parseMd('---\n---\n\nbody\n')).toEqual({ frontmatter: {}, body: 'body\n' });
    expect(parseMd('---\ndescription: x\n---')).toEqual({
      frontmatter: { description: 'x' },
      body: '',
    });
  });
});
