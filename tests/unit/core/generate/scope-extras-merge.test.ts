/**
 * The scopeExtras emission path and the shared merge policy.
 *
 * Two things are proven here.
 *
 * 1. `emitScopeExtras` behaves like `emitGeneratedOutput`: it reads the file,
 *    applies `mergeOutputContent`, replaces a pending result for the same path,
 *    and recomputes status from the merged value — including for a plugin
 *    descriptor, whose extras omit `target` entirely.
 *
 * 2. Routing extras through the policy is safe for the generators that already
 *    merge internally. For every such path the policy must be a no-op or
 *    idempotent, otherwise the second fold would undo the first. Zed is the case
 *    that is NOT idempotent as a finished file, which is why its hook emits a
 *    revocation projection instead — asserted here so the design cannot quietly
 *    regress to emitting a merged image.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { emitScopeExtras } from '../../../../src/core/generate/scope-extras.js';
import { mergeOutputContent } from '../../../../src/core/generate/merge-policy.js';
import {
  getDescriptor,
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import type { CanonicalFiles, GenerateResult } from '../../../../src/core/types.js';
import { zedScopeExtras } from '../../../../src/targets/zed/scope-extras.js';
import { clearAiderConf } from '../../../../src/targets/aider/conf-file.js';

let root = '';

function canonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

function seed(relPath: string, content: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-scope-extras-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('emitScopeExtras', () => {
  it('applies the descriptor merge hook to a canonical-only projection', async () => {
    seed(
      '.copilot/mcp-config.json',
      JSON.stringify({ $schema: 'x', mcpServers: { keep: { command: 'k' } } }, null, 2),
    );
    const results: GenerateResult[] = [];

    await emitScopeExtras(
      results,
      'copilot',
      [
        {
          target: 'copilot',
          path: '.copilot/mcp-config.json',
          content: JSON.stringify({ mcpServers: { ctx: { command: 'npx' } } }, null, 2),
          status: 'updated',
        },
      ],
      root,
    );

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    expect(parsed.$schema).toBe('x');
    expect(parsed.mcpServers).toEqual({ ctx: { command: 'npx' } });
    expect(results[0]!.status).toBe('updated');
    expect(results[0]!.currentContent).toBe(
      JSON.stringify({ $schema: 'x', mcpServers: { keep: { command: 'k' } } }, null, 2),
    );
  });

  it('replaces a pending result for the same path and merges onto it', async () => {
    const results: GenerateResult[] = [
      {
        target: 'copilot',
        path: '.copilot/mcp-config.json',
        content: JSON.stringify({ $schema: 'pending', mcpServers: {} }),
        status: 'created',
      },
    ];

    await emitScopeExtras(
      results,
      'copilot',
      [
        {
          target: 'copilot',
          path: '.copilot/mcp-config.json',
          content: JSON.stringify({ mcpServers: { ctx: { command: 'npx' } } }),
          status: 'created',
        },
      ],
      root,
    );

    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    expect(parsed.$schema).toBe('pending');
    expect(parsed.mcpServers).toEqual({ ctx: { command: 'npx' } });
  });

  it('marks a result unchanged when the merge leaves the file as it was', async () => {
    const onDisk = JSON.stringify({ mcpServers: { ctx: { command: 'npx' } } }, null, 2);
    seed('.copilot/mcp-config.json', onDisk);
    const results: GenerateResult[] = [];

    await emitScopeExtras(
      results,
      'copilot',
      [
        {
          target: 'copilot',
          path: '.copilot/mcp-config.json',
          content: onDisk,
          status: 'created',
        },
      ],
      root,
    );

    expect(results[0]!.status).toBe('unchanged');
  });
});

describe('emitScopeExtras — plugin descriptors', () => {
  beforeAll(async () => {
    const mod: { descriptor: unknown } =
      await import('../../../fixtures/plugins/rich-plugin/index.js');
    registerTargetDescriptor(mod.descriptor as TargetDescriptor);
    expect(getDescriptor('rich-plugin')).toBeDefined();
  });
  afterAll(() => resetRegistry());

  it('fills in the target and applies the plugin hook to an extra with no target', async () => {
    seed('.rich/mcp.json', JSON.stringify({ theme: 'mine', mcpServers: { old: {} } }, null, 2));
    const results: GenerateResult[] = [];

    await emitScopeExtras(
      results,
      'rich-plugin',
      [
        {
          path: '.rich/mcp.json',
          content: JSON.stringify({ mcpServers: { ctx: { command: 'npx' } } }),
        } as unknown as GenerateResult,
      ],
      root,
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.target).toBe('rich-plugin');
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    expect(parsed.theme).toBe('mine');
    expect(parsed.mcpServers).toEqual({ ctx: { command: 'npx' } });
  });
});

describe('generators that merge internally survive the shared policy', () => {
  /** The policy applied to an already-merged file must give that file back. */
  async function assertIdempotent(
    target: string,
    extras: readonly GenerateResult[],
    onDisk: string,
  ): Promise<void> {
    expect(extras).toHaveLength(1);
    const merged = mergeOutputContent(
      target,
      onDisk,
      undefined,
      extras[0]!.content,
      extras[0]!.path,
    );
    expect(merged).toBe(extras[0]!.content);
  }

  it('aider: the cleared .aider.conf.yml survives its own merge hook', async () => {
    const onDisk = ['model: gpt-4o', '# agentsmesh: generated', 'lint-cmd: npm run lint', ''].join(
      '\n',
    );
    seed('.aider.conf.yml', onDisk);
    const extras = await clearAiderConf(canonical(), root, 'project', new Set(['hooks']));
    await assertIdempotent('aider', extras, onDisk);
  });

  it('zed emits a revocation projection, not a finished file', async () => {
    const onDisk = JSON.stringify(
      { theme: 'One Dark', context_servers: { stale: { command: 'x' } } },
      null,
      2,
    );
    seed('.zed/settings.json', onDisk);

    const extras = await zedScopeExtras(
      canonical({ mcp: { mcpServers: {} } }),
      root,
      'project',
      new Set(['mcp']),
    );

    // The projection is NOT the finished file: a finished file would lose the
    // revocation, because an absent key means "not claimed" to the merge hook.
    expect(JSON.parse(extras[0]!.content)).toEqual({ context_servers: null });
    const merged = mergeOutputContent(
      'zed',
      onDisk,
      undefined,
      extras[0]!.content,
      extras[0]!.path,
    );
    expect(JSON.parse(merged)).toEqual({ theme: 'One Dark' });
  });

  /**
   * Every other internally-merging scopeExtras path: no descriptor hook claims
   * it and it is not a `SETTINGS_JSON_PATHS` file, so the policy returns the
   * generated content untouched. That is what makes central routing safe for
   * them without any per-target opt-out.
   */
  it.each([
    ['antigravity', '.gemini/antigravity-cli/settings.json'],
    ['goose', '.config/goose/config.yaml'],
    ['goose', '.config/goose/permission.yaml'],
    ['kimi-code', '.kimi-code/config.toml'],
    ['kiro', '.kiro/settings/permissions.yaml'],
    ['warp', '.warp/settings.toml'],
    ['trae', '.trae/permission/global.json'],
    ['deepagents-cli', '.deepagents/config.toml'],
  ])('%s %s is untouched by the shared policy', (target, path) => {
    const generated = 'already-merged-content';
    expect(mergeOutputContent(target, 'on-disk', undefined, generated, path)).toBe(generated);
  });
});
