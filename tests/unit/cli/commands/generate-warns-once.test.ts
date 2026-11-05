/**
 * The matrix printed after generate reuses the config generate loaded, so a
 * warning from loading it (here: skipped MCP servers) shows once, not twice.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { logger } from '../../../../src/utils/output/logger.js';

let base = '';
let warn: MockInstance<typeof logger.warn>;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-generate-warns-once-'));
  vi.stubEnv('HOME', join(base, 'home'));
  vi.stubEnv('USERPROFILE', join(base, 'home'));
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

describe('generate and the matrix it prints', () => {
  it('prints a skipped-settings warning once', async () => {
    const shared = join(base, 'shared', '.agentsmesh');
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, 'mcp.json'), '{"mcpServers":{"sharedsrv":{"command":"s"}}}');
    const project = join(base, 'project');
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

    await runGenerate({}, project);

    const skipped = warn.mock.calls.filter(([msg]) => String(msg).includes('Skipped MCP servers'));
    expect(skipped).toHaveLength(1);
  });
});
