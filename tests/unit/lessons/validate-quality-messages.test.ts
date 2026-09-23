/**
 * Regex-trigger findings are printed by the CLI and returned over MCP, where
 * error text runs through a path redactor. They must read correctly in both:
 * name the real reason, echo no `/word` token a redactor takes for a host
 * path, and never list a shape the linear engine accepts as a cause.
 */

import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { collectInvalidTriggerPatterns } from '../../../src/lessons/validate-quality.js';
import type { ValidationFinding } from '../../../src/lessons/validate.js';
import { redactAbsolutePaths } from '../../../src/mcp/errors.js';

function findingFor(pattern: string): ValidationFinding {
  const graph: LessonsGraph = {
    version: 2,
    lessons: {},
    topics: {},
    triggers: { t: { kind: 'command_pattern', pattern } },
  };
  const findings: ValidationFinding[] = [];
  collectInvalidTriggerPatterns(graph, findings);
  expect(findings).toHaveLength(1);
  return findings[0]!;
}

describe('command_pattern finding messages', () => {
  it.each([
    ['(a)\\1', 'backreference'],
    ['git (?=push)', 'lookaround'],
    ['(?<!x)y', 'lookaround'],
  ])('UNSAFE_TRIGGER_PATTERN for %s names the unsupported construct', (pattern, reason) => {
    const f = findingFor(pattern);
    expect(f.code).toBe('UNSAFE_TRIGGER_PATTERN');
    expect(f.message).toContain(reason);
    expect(f.message).toContain(pattern);
    expect(redactAbsolutePaths(f.message)).toBe(f.message);
    expect(f.message).not.toMatch(/(?<!\.)\.\.(?!\.)/);
  });

  it('does not claim nested quantifiers are rejected: the engine runs them linearly', () => {
    const f = findingFor('(a)\\1');
    expect(f.message).not.toMatch(/like \(a\+\)\+|\(a\|aa\)\+|a\+a\+/);
    expect(f.message).toMatch(/\(a\+\)\+ (is|are) fine/);
  });

  it('INVALID_TRIGGER_PATTERN keeps the parser reason without the slash-wrapped echo', () => {
    const f = findingFor('abc[');
    expect(f.code).toBe('INVALID_TRIGGER_PATTERN');
    expect(f.message).toContain('Unterminated character class');
    expect(f.message).toContain('abc[');
    expect(f.message).not.toContain('/abc[/');
    expect(redactAbsolutePaths(f.message)).toBe(f.message);
    expect(f.message).not.toMatch(/(?<!\.)\.\.(?!\.)/);
  });
});
