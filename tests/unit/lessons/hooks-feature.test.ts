/**
 * `generate` projects hooks only when `hooks` is in `features`. When it is not,
 * the lessons recall hook reaches no tool, so setup and generate say so and name
 * the file that holds the effective feature list.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hooksFeatureOffWarning } from '../../../src/lessons/hooks-feature.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-hooks-feature-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const write = (name: string, text: string): void => writeFileSync(join(root, name), text, 'utf8');
const config = (features: string): string =>
  `version: 1\ntargets:\n  - claude-code\nfeatures:\n${features}`;

describe('hooksFeatureOffWarning', () => {
  it('warns, naming the fix, when hooks is missing from features', () => {
    write('agentsmesh.yaml', config('  - rules\n  - mcp\n'));
    expect(hooksFeatureOffWarning(root)).toBe(
      'The lessons recall hook will not reach any tool: `hooks` is not in `features` in ' +
        "agentsmesh.yaml. Add `hooks` to `features` in agentsmesh.yaml, then run 'agentsmesh generate'.",
    );
  });

  it('stays quiet when hooks is in features', () => {
    write('agentsmesh.yaml', config('  - rules\n  - hooks\n'));
    expect(hooksFeatureOffWarning(root)).toBeNull();
  });

  it('stays quiet when features is not set, because every feature is on by default', () => {
    write('agentsmesh.yaml', 'version: 1\ntargets:\n  - claude-code\n');
    expect(hooksFeatureOffWarning(root)).toBeNull();
  });

  it('stays quiet when there is no config or it cannot be read', () => {
    expect(hooksFeatureOffWarning(root)).toBeNull();
    write('agentsmesh.yaml', 'features: [unclosed\n');
    expect(hooksFeatureOffWarning(root)).toBeNull();
    write('agentsmesh.yaml', 'features: rules\n');
    expect(hooksFeatureOffWarning(root)).toBeNull();
  });

  it('follows the local file, which replaces features when it sets a list', () => {
    write('agentsmesh.yaml', config('  - rules\n  - hooks\n'));
    write('agentsmesh.local.yaml', 'features:\n  - rules\n');
    expect(hooksFeatureOffWarning(root)).toContain('not in `features` in agentsmesh.local.yaml');
    expect(hooksFeatureOffWarning(root)).toContain(
      'Add `hooks` to `features` in agentsmesh.local.yaml',
    );
  });

  it('ignores an empty or invalid local features list, like the config loader', () => {
    write('agentsmesh.yaml', config('  - rules\n  - hooks\n'));
    write('agentsmesh.local.yaml', 'features: []\n');
    expect(hooksFeatureOffWarning(root)).toBeNull();
    write('agentsmesh.local.yaml', 'features: [unclosed\n');
    expect(hooksFeatureOffWarning(root)).toBeNull();
  });

  it('keeps a local file without features from changing the project list', () => {
    write('agentsmesh.yaml', config('  - rules\n'));
    write('agentsmesh.local.yaml', 'targets:\n  - cursor\n');
    expect(hooksFeatureOffWarning(root)).toContain('agentsmesh.yaml');
  });
});
