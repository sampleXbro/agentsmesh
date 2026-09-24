/**
 * Hooks across the three layers (extends → packs → local).
 *
 * - A local event still overrides an extend's hooks for that event (the
 *   documented "project overrides" precedence for layered config).
 * - Installed pack hooks are never dropped: not by another pack, not by an
 *   extend, and not by a local event (e.g. the recall hook `init --lessons`
 *   adds to PreToolUse). Removing a pack hook means uninstalling the pack.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';

let base: string;
let project: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'amesh-hook-layers-'));
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh'), { recursive: true });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

const hook = (command: string): string => `  - matcher: Bash\n    command: ${command}\n`;

function hooksAt(dir: string, events: Record<string, string[]>): void {
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(events)
    .map(([event, commands]) => `${event}:\n${commands.map(hook).join('')}`)
    .join('');
  writeFileSync(join(dir, 'hooks.yaml'), yaml);
}

function packAt(name: string, events: Record<string, string[]>): void {
  const dir = join(project, '.agentsmesh', 'packs', name);
  hooksAt(dir, events);
  writeFileSync(
    join(dir, 'pack.yaml'),
    [
      `name: ${name}`,
      'source: github:org/repo@abc123',
      'source_kind: github',
      'installed_at: "2026-03-22T10:00:00Z"',
      'updated_at: "2026-03-22T10:00:00Z"',
      'content_hash: sha256:aabbcc',
      'features:',
      '  - hooks',
    ].join('\n'),
  );
}

function config(withExtend: boolean): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code'],
    features: ['hooks'],
    extends: withExtend
      ? [{ name: 'base', source: join('..', 'shared'), features: ['hooks'] }]
      : [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  } as ValidatedConfig;
}

async function preToolUse(withExtend: boolean): Promise<string[]> {
  const { canonical } = await loadCanonicalWithExtends(config(withExtend), project);
  return (canonical.hooks?.PreToolUse ?? []).map((h) => h.command);
}

describe('hooks across extends, packs and local', () => {
  it('local overrides the extend, but the pack hook survives', async () => {
    hooksAt(join(base, 'shared', '.agentsmesh'), { PreToolUse: ['extend-hook'] });
    packAt('guard', { PreToolUse: ['pack-guard'] });
    hooksAt(join(project, '.agentsmesh'), { PreToolUse: ['local-recall'] });
    expect(await preToolUse(true)).toEqual(['local-recall', 'pack-guard']);
  });

  it('two packs on the same event are combined', async () => {
    packAt('a-pack', { PreToolUse: ['hook-a'] });
    packAt('b-pack', { PreToolUse: ['hook-b'] });
    expect(await preToolUse(false)).toEqual(['hook-a', 'hook-b']);
  });

  it('a pack does not drop the extend hooks for its event', async () => {
    hooksAt(join(base, 'shared', '.agentsmesh'), { PreToolUse: ['extend-hook'] });
    packAt('guard', { PreToolUse: ['pack-guard'] });
    expect(await preToolUse(true)).toEqual(['extend-hook', 'pack-guard']);
  });
});
