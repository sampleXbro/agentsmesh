/**
 * `generate --json` mutes the logger, so the data carries the settings that
 * were skipped from packs and extends; it is absent when nothing was skipped.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { logger } from '../../../../src/utils/output/logger.js';

let base = '';
let project = '';

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-generate-skipped-settings-'));
  vi.stubEnv('HOME', join(base, 'home'));
  vi.stubEnv('USERPROFILE', join(base, 'home'));
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  const shared = join(base, 'shared', '.agentsmesh');
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, 'mcp.json'), '{"mcpServers":{"sharedsrv":{"command":"s"}}}');
  project = join(base, 'project');
  mkdirSync(join(project, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(project, '.agentsmesh', 'rules', '_root.md'),
    '---\nroot: true\n---\n# Root\n',
  );
  writeFileSync(
    join(project, 'agentsmesh.yaml'),
    'version: 1\ntargets: [claude-code]\nfeatures: [rules, mcp]\n' +
      'extends:\n  - name: base\n    source: ../shared\n    features: [mcp]\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('generate data — skippedSettings', () => {
  it.each([
    ['generate', {}],
    ['dry-run', { 'dry-run': true }],
    ['check', { check: true }],
  ])('lists the skipped MCP servers in %s mode', async (_mode, flags) => {
    const { data } = await runGenerate(flags, project, { printMatrix: false });

    expect(data.skippedSettings).toEqual([{ feature: 'mcp', items: ['sharedsrv'] }]);
  });

  it('leaves the field out when nothing was skipped', async () => {
    writeFileSync(join(project, '.agentsmesh', 'mcp.json'), '{"mcpServers":{}}');

    const { data } = await runGenerate({}, project, { printMatrix: false });

    expect(Object.keys(data)).toEqual(['scope', 'mode', 'files', 'summary']);
  });
});
