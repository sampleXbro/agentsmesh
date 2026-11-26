import { describe, it, expect } from 'vitest';
import { formatConfigIssues, formatIssuePath } from '../../../src/config/core/format-issues.js';
import { configSchema } from '../../../src/config/core/schema.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';

function issuesOf(raw: unknown): ReturnType<typeof formatConfigIssues> {
  const result = configSchema.safeParse(raw);
  if (result.success) throw new Error('expected the config to be invalid');
  return formatConfigIssues(result.error.issues);
}

describe('formatIssuePath', () => {
  it('writes keys with dots and indexes with brackets', () => {
    expect(formatIssuePath(['targets', 1])).toBe('targets[1]');
    expect(formatIssuePath(['extends', 0, 'features', 2])).toBe('extends[0].features[2]');
    expect(formatIssuePath(['collaboration', 'strategy'])).toBe('collaboration.strategy');
  });

  it('is empty for the root and keeps a leading index', () => {
    expect(formatIssuePath([])).toBe('');
    expect(formatIssuePath([0, 'a'])).toBe('[0].a');
  });

  it('prints symbol keys', () => {
    expect(formatIssuePath(['a', Symbol('s')])).toBe('a.Symbol(s)');
  });
});

describe('formatConfigIssues', () => {
  it('names the key of each issue', () => {
    expect(issuesOf({ version: 1, features: 'rules' })).toEqual([
      'features: Invalid input: expected array, received string',
    ]);
  });

  it('names the array index of a bad target and shortens the long id list', () => {
    const issues = issuesOf({ version: 1, targets: ['claude-code', 42] });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toBe(
      `targets[1]: Invalid option: not one of the ${TARGET_IDS.length} supported values, ` +
        `e.g. "${TARGET_IDS[0]}"|"${TARGET_IDS[1]}"|"${TARGET_IDS[2]}"|… ` +
        '(full list: https://samplexbro.github.io/agentsmesh/reference/supported-tools/)',
    );
  });

  it('keeps the full list when an enum is short', () => {
    expect(issuesOf({ version: 1, collaboration: { strategy: 'nope' } })).toEqual([
      'collaboration.strategy: Invalid option: expected one of "merge"|"lock"|"last-wins"',
    ]);
  });

  it('keeps the eight feature names in full', () => {
    expect(issuesOf({ version: 1, features: ['rules', 'bogus'] })).toEqual([
      'features[1]: Invalid option: expected one of ' +
        '"rules"|"commands"|"agents"|"skills"|"mcp"|"hooks"|"ignore"|"permissions"',
    ]);
  });

  it('prefixes nested paths', () => {
    expect(
      issuesOf({ version: 1, extends: [{ name: 'x', source: 's', features: ['bad'] }] }),
    ).toEqual([
      'extends[0].features[0]: Invalid option: expected one of ' +
        '"rules"|"commands"|"agents"|"skills"|"mcp"|"hooks"|"ignore"|"permissions"',
    ]);
  });

  it('reports every issue, in order', () => {
    expect(issuesOf({ version: 1, targets: ['claude-code', 42], features: 'rules' })).toEqual([
      expect.stringMatching(/^targets\[1\]: /),
      'features: Invalid input: expected array, received string',
    ]);
  });

  it('leaves a root-level issue without a prefix', () => {
    expect(issuesOf(null)).toEqual(['Invalid input: expected object, received null']);
  });

  it('prefixes unknown-key issues with the object they are in', () => {
    expect(issuesOf({ version: 1, plugins: [{ id: 'a', source: 's', extra: 1 }] })).toEqual([
      'plugins[0]: Unrecognized key: "extra"',
    ]);
  });
});
