/**
 * Ordinary Markdown that used to fail generation: link syntax quoted inside
 * inline code, GFM footnote definitions, and URLs containing parentheses.
 */

import { describe, expect, it } from 'vitest';
import { scanMarkdownLinks } from '../../../../src/core/reference/markdown-link-scan.js';
import {
  inlineCodeRanges,
  protectedRanges,
} from '../../../../src/core/reference/protected-ranges.js';
import {} from '../../../../src/core/reference/link-format-registry.js';

describe('scanMarkdownLinks', () => {
  it('ignores a GFM footnote definition', () => {
    const tokens = scanMarkdownLinks('Text.[^1]\n\n[^1]: See the design notes.\n');
    expect(tokens).toEqual([]);
  });

  it('still reads a real reference definition', () => {
    const tokens = scanMarkdownLinks('[spec]: docs/spec.md\n');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.destination).toBe('docs/spec.md');
    expect(tokens[0]?.label).toBe('spec');
  });
});

describe('inlineCodeRanges', () => {
  it('covers a single-backtick span', () => {
    const content = 'Use `[label](path/to/file.md)` in a rule.';
    const ranges = inlineCodeRanges(content);
    const linkOffset = content.indexOf('[label]');
    expect(ranges.some(([s, e]) => linkOffset >= s && linkOffset < e)).toBe(true);
  });

  it('covers a double-backtick span containing a backtick', () => {
    const content = 'Write ``a ` [x](y.md)`` here.';
    const linkOffset = content.indexOf('[x]');
    expect(inlineCodeRanges(content).some(([s, e]) => linkOffset >= s && linkOffset < e)).toBe(
      true,
    );
  });

  it('leaves ordinary prose alone', () => {
    expect(inlineCodeRanges('See [x](y.md) for details.')).toEqual([]);
  });

  it('does not treat an unpaired backtick as a span', () => {
    expect(inlineCodeRanges('A stray ` tick and [x](y.md).')).toEqual([]);
  });
});

describe('protectedRanges', () => {
  it('protects a URL whose path contains parentheses', () => {
    const url = 'https://github.com/org/repo/blob/main/apps/(marketing)/package.json';
    const content = `See ${url} for the manifest.`;
    const ranges = protectedRanges(content);
    const tail = content.indexOf('(marketing)');

    expect(
      ranges.some(([s, e]) => tail >= s && tail + '(marketing)/package.json'.length <= e),
    ).toBe(true);
  });

  it('protects a URL with a parenthesised segment inside a markdown link', () => {
    const content = '[pkg](https://example.com/Foo_(bar)/README.md)';
    const inner = content.indexOf('https://');
    const ranges = protectedRanges(content);
    const covering = ranges.find(([s, e]) => inner >= s && inner < e);

    expect(covering).toBeDefined();
    // The closing paren of the markdown link must stay outside the protected span.
    expect(content.slice(covering![0], covering![1])).toBe(
      'https://example.com/Foo_(bar)/README.md',
    );
  });

  it('leaves a plain URL span unchanged', () => {
    const content = 'See https://example.com/docs/guide.md now.';
    const ranges = protectedRanges(content);
    const start = content.indexOf('https://');
    const covering = ranges.find(([s, e]) => start >= s && start < e);
    expect(content.slice(covering![0], covering![1])).toBe('https://example.com/docs/guide.md');
  });
});

describe('protectedRanges — parenthesis edge cases', () => {
  it('stops at an unterminated parenthesis group that runs into prose', () => {
    const content = 'See https://example.com/a/(oops and then more words.';
    const ranges = protectedRanges(content);
    const covering = ranges.find(([s]) => s === content.indexOf('https://'));
    expect(content.slice(covering![0], covering![1])).toBe('https://example.com/a/');
  });

  it('stops when a parenthesis group never closes before the end of content', () => {
    const content = 'https://example.com/a/(oops';
    const ranges = protectedRanges(content);
    expect(content.slice(ranges[0]![0], ranges[0]![1])).toBe('https://example.com/a/');
  });

  it('absorbs a nested parenthesis group', () => {
    const content = 'https://example.com/a_(b_(c))/d.md next';
    const ranges = protectedRanges(content);
    expect(content.slice(ranges[0]![0], ranges[0]![1])).toBe('https://example.com/a_(b_(c))/d.md');
  });
});
