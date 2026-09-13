import { afterEach, describe, expect, it } from 'vitest';
import { managedOutputDirs } from '../../../../src/core/generate/output-boundaries.js';
import {
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';

afterEach(() => {
  resetRegistry();
});

describe('managedOutputDirs', () => {
  it('lists managed directories plus the parents of static and superseded files', () => {
    expect(managedOutputDirs(['claude-code'], 'project', [])).toEqual([
      '.claude',
      '.claude/agents',
      '.claude/commands',
      '.claude/rules',
      '.claude/skills',
    ]);
  });

  it('covers a registered plugin descriptor the same way', async () => {
    const mod: { descriptor: unknown } =
      await import('../../../fixtures/plugins/rich-plugin/index.js');
    registerTargetDescriptor(mod.descriptor as TargetDescriptor);

    expect(managedOutputDirs(['rich-plugin'], 'project', [])).toEqual([
      '.rich',
      '.rich/agents',
      '.rich/commands',
      '.rich/rules',
      '.rich/skills',
    ]);
  });

  it('skips directories retained for targets this run did not generate', () => {
    expect(managedOutputDirs(['codex-cli'], 'project', ['goose'])).toEqual([
      '.codex/agents',
      '.codex/instructions',
      '.codex/rules',
    ]);
  });

  it('returns nothing for an unknown target', () => {
    expect(managedOutputDirs(['no-such-target'], 'project', [])).toEqual([]);
  });
});
