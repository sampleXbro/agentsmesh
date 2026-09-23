/**
 * `hookContextEvents` must hold for third-party plugin targets as well as
 * builtins: the engine projects recall hooks for both.
 *
 * A descriptor that says its hooks cannot inject context on an event must never
 * receive the lessons recall entry there: the entry would run on every tool
 * call and change nothing, and on some hosts a failing pre-tool hook blocks the
 * call outright. User-authored hooks on the same event must still reach it.
 * Every hooks emission path is covered, because a path that skips the
 * projection is invisible to types.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  generateHooksFeature,
  generateScopedSettingsFeature,
} from '../../../../src/core/generate/optional-features.js';
import {
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { GenerateResult } from '../../../../src/core/result-types.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import { makeCanonical } from '../../targets/canonical-factory.js';

const ID = 'recall-probe-plugin';
const RECALL = 'agentsmesh lessons hook';

function canonical(): CanonicalFiles {
  return makeCanonical({
    hooks: {
      PreToolUse: [
        { matcher: 'Edit|Write|Bash', command: RECALL },
        { matcher: 'Bash', command: 'echo user-hook' },
      ],
      SessionStart: [{ matcher: '*', command: RECALL }],
    },
  });
}

function echoHooks(path: string) {
  return (c: CanonicalFiles): { path: string; content: string }[] => [
    { path, content: JSON.stringify(c.hooks) },
  ];
}

function descriptor(): TargetDescriptor {
  return {
    id: ID,
    metadata: {
      displayName: ID,
      category: 'cli',
      officialUrl: 'https://example.test/recall',
      shortDescription: 'Recall projection probe',
    },
    generators: {
      name: ID,
      generateRules: () => [],
      generateHooks: echoHooks('.probe/hooks.json'),
      importFrom: async () => [],
    },
    capabilities: {
      rules: 'native',
      additionalRules: 'none',
      commands: 'none',
      agents: 'none',
      skills: 'none',
      mcp: 'none',
      hooks: 'native',
      ignore: 'none',
      permissions: 'none',
    },
    hookContextEvents: ['SessionStart'],
    emitScopedSettings: echoHooks('.probe/settings.json'),
    emptyImportMessage: 'No probe files.',
    lintRules: null,
    project: {
      paths: {
        rulePath: () => '.probe/rules/root.md',
        commandPath: () => null,
        agentPath: () => null,
      },
    },
    buildImportPaths: async (refs: Map<string, string>) => {
      refs.set('.probe/rules/root.md', '.agentsmesh/rules/_root.md');
    },
    detectionPaths: ['.probe'],
  } as unknown as TargetDescriptor;
}

const config = {
  version: 1,
  targets: [ID],
  features: ['rules', 'hooks'],
  extends: [],
  overrides: {},
  collaboration: { strategy: 'merge', lock_features: [] },
} as unknown as ValidatedConfig;

function hooksAt(results: GenerateResult[], path: string): Record<string, { command: string }[]> {
  const out = results.find((r) => r.path === path);
  if (!out) throw new Error(`no output at ${path}`);
  return JSON.parse(out.content) as Record<string, { command: string }[]>;
}

afterEach(() => resetRegistry());

describe('recall hook projection for plugin descriptors', () => {
  it('drops the recall entry from events the plugin cannot inject on, keeping user hooks', async () => {
    registerTargetDescriptor(descriptor());
    const results: GenerateResult[] = [];
    await generateHooksFeature(results, [ID], canonical(), '/tmp/recall-probe', 'project', config);
    const hooks = hooksAt(results, '.probe/hooks.json');
    expect(hooks.PreToolUse!.map((h) => h.command)).toEqual(['echo user-hook']);
    expect(hooks.SessionStart!.map((h) => h.command)).toEqual([RECALL]);
  });

  it('rejects a malformed hookContextEvents when the plugin registers', () => {
    // A string instead of a list would silently match per character.
    const bad = {
      ...descriptor(),
      hookContextEvents: 'SessionStart',
    } as unknown as TargetDescriptor;
    expect(() => registerTargetDescriptor(bad)).toThrow();
  });

  it('applies the same projection on the scoped-settings path', async () => {
    registerTargetDescriptor(descriptor());
    const results: GenerateResult[] = [];
    await generateScopedSettingsFeature(
      results,
      [ID],
      canonical(),
      '/tmp/recall-probe',
      'project',
      new Set(['rules', 'hooks']),
    );
    const hooks = hooksAt(results, '.probe/settings.json');
    expect(hooks.PreToolUse!.map((h) => h.command)).toEqual(['echo user-hook']);
    expect(hooks.SessionStart!.map((h) => h.command)).toEqual([RECALL]);
  });
});
