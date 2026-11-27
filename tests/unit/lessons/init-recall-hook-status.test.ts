/**
 * `scaffoldLessons` always says what happened to the recall hook, so a missing
 * hooks.yaml is never mistaken for "already current", and warns when `generate`
 * would not project hooks at all.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldLessons } from '../../../src/lessons/init.js';
import { hooksFeatureOffWarning } from '../../../src/lessons/hooks-feature.js';

const TEMPLATE =
  '# yaml-language-server: $schema=https://example.test/hooks.json\n# Lifecycle hooks\n';

let root: string;
const hooksPath = (): string => join(root, '.agentsmesh', 'hooks.yaml');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lessons-hook-status-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scaffoldLessons — recall hook status', () => {
  it('reports a skip with the reason when hooks.yaml is missing and no template is given', async () => {
    const result = await scaffoldLessons(root);
    expect(result.recallHook).toEqual({
      status: 'skipped',
      reason: 'there is no .agentsmesh/hooks.yaml to wire it into',
    });
    expect(result.recallHookInjected).toBe(false);
    expect(existsSync(hooksPath())).toBe(false);
  });

  it('creates hooks.yaml from the template and wires the recall hook into it', async () => {
    const result = await scaffoldLessons(root, { hooksTemplate: TEMPLATE });
    expect(result.recallHook).toEqual({ status: 'created' });
    expect(result.recallHookInjected).toBe(true);
    const text = readFileSync(hooksPath(), 'utf8');
    expect(text.startsWith(TEMPLATE)).toBe(true);
    expect(text).toContain('command: agentsmesh lessons hook');
  });

  it('is current on a re-run, not silent and not wired again', async () => {
    await scaffoldLessons(root, { hooksTemplate: TEMPLATE });
    const first = readFileSync(hooksPath(), 'utf8');
    const second = await scaffoldLessons(root, { hooksTemplate: TEMPLATE });
    expect(second.recallHook).toEqual({ status: 'current' });
    expect(second.recallHookInjected).toBe(false);
    expect(readFileSync(hooksPath(), 'utf8')).toBe(first);
  });

  it('reports wired for an existing hooks.yaml that had no recall entries', async () => {
    mkdirSync(join(root, '.agentsmesh'), { recursive: true });
    writeFileSync(hooksPath(), '# hooks\n', 'utf8');
    const result = await scaffoldLessons(root, { hooksTemplate: TEMPLATE });
    expect(result.recallHook).toEqual({ status: 'wired' });
    expect(result.recallHookInjected).toBe(true);
    expect(readFileSync(hooksPath(), 'utf8')).not.toContain('example.test');
  });
});

describe('scaffoldLessons — hooks feature warning', () => {
  const config = (features: string): void =>
    writeFileSync(
      join(root, 'agentsmesh.yaml'),
      `version: 1\ntargets:\n  - claude-code\n${features}`,
    );

  it('carries the warning when hooks is not in features', async () => {
    config('features:\n  - rules\n');
    const result = await scaffoldLessons(root, { hooksTemplate: TEMPLATE });
    expect(result.hooksFeatureWarning).toBe(hooksFeatureOffWarning(root));
    expect(result.hooksFeatureWarning).toContain('Add `hooks` to `features` in agentsmesh.yaml');
  });

  it('carries no warning when hooks is in features, by default or listed', async () => {
    config('');
    expect((await scaffoldLessons(root)).hooksFeatureWarning).toBeNull();
    config('features:\n  - rules\n  - hooks\n');
    expect((await scaffoldLessons(root)).hooksFeatureWarning).toBeNull();
  });

  it('carries no warning when there is no config to read', async () => {
    expect((await scaffoldLessons(root)).hooksFeatureWarning).toBeNull();
  });
});
