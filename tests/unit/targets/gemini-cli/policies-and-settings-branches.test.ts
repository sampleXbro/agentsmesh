/**
 * Branch coverage tests for:
 *   - src/targets/gemini-cli/policies-generator.ts
 *   - src/targets/gemini-cli/format-helpers-settings.ts
 */
import { AB_HOOKS, AB_IGNORE, AB_MCP } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateGeminiPermissionsPolicies } from '../../../../src/targets/gemini-cli/policies-generator.js';
import { importGeminiSettings } from '../../../../src/targets/gemini-cli/format-helpers-settings.js';
import {
  GEMINI_DEFAULT_POLICIES_FILE,
  GEMINI_SETTINGS,
} from '../../../../src/targets/gemini-cli/constants.js';
import type { CanonicalFiles, ImportResult } from '../../../../src/core/types.js';

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
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

describe('generateGeminiPermissionsPolicies — empty branches', () => {
  it('returns [] when permissions is null', () => {
    expect(generateGeminiPermissionsPolicies(makeCanonical({ permissions: null }))).toEqual([]);
  });

  it('returns [] when allow + deny are both empty', () => {
    expect(
      generateGeminiPermissionsPolicies(makeCanonical({ permissions: { allow: [], deny: [] } })),
    ).toEqual([]);
  });
});

describe('generateGeminiPermissionsPolicies — kind branches', () => {
  it('emits a tool-only rule for bare tool names (Read / Grep / LS / WebFetch)', () => {
    const result = generateGeminiPermissionsPolicies(
      makeCanonical({ permissions: { allow: ['Read', 'Grep', 'LS', 'WebFetch'], deny: [] } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe(GEMINI_DEFAULT_POLICIES_FILE);
    const content = result[0]!.content;
    expect(content).toContain('toolName = "read_file"');
    expect(content).toContain('toolName = "grep_search"');
    expect(content).toContain('toolName = "list_directory"');
    expect(content).toContain('toolName = "web_fetch"');
    // priorities for allow start at 100 and increment
    expect(content).toContain('priority = 100');
    expect(content).toContain('priority = 103');
  });

  it('emits a Bash commandPrefix rule with normalized prefix (strips :*  and *)', () => {
    const result = generateGeminiPermissionsPolicies(
      makeCanonical({
        permissions: { allow: ['Bash(curl:*)'], deny: ['Bash(rm -rf*)'] },
      }),
    );
    const content = result[0]!.content;
    expect(content).toContain('toolName = "run_shell_command"');
    expect(content).toContain('commandPrefix = "curl"');
    expect(content).toContain('commandPrefix = "rm -rf"');
    expect(content).toContain('decision = "allow"');
    expect(content).toContain('decision = "deny"');
    // deny priorities start at 200
    expect(content).toContain('priority = 200');
  });

  it('emits a Read rule with regex-escaped argsPattern', () => {
    const result = generateGeminiPermissionsPolicies(
      makeCanonical({ permissions: { allow: ['Read(/etc/**.conf)'], deny: [] } }),
    );
    const content = result[0]!.content;
    expect(content).toContain('toolName = "read_file"');
    // regex metacharacters in /etc/**.conf must be escaped (.*+? all escaped)
    expect(content).toContain('argsPattern =');
    expect(content).toContain('\\\\.');
  });

  it('falls through to unknown-expression best-effort toolName entry', () => {
    const result = generateGeminiPermissionsPolicies(
      makeCanonical({ permissions: { allow: ['CustomNotInMap'], deny: [] } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toContain('toolName = "CustomNotInMap"');
  });
});

describe('importGeminiSettings — branches', () => {
  const TEST_DIR = join(tmpdir(), 'am-gemini-settings-import-test');

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  it('returns silently when settings.json does not exist', async () => {
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('returns silently when settings.json is malformed JSON', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(join(TEST_DIR, GEMINI_SETTINGS), '{ not: json');
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results).toEqual([]);
    expect(existsSync(join(TEST_DIR, '.agentsmesh'))).toBe(false);
  });

  it('skips mcpServers when value is null/empty/non-object', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({ mcpServers: null, ignorePatterns: [] }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results).toEqual([]);
  });

  it('imports mcpServers when present and non-empty', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } },
      }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results).toHaveLength(1);
    expect(results[0]!.toPath).toBe(AB_MCP);
    expect(readFileSync(join(TEST_DIR, AB_MCP), 'utf-8')).toContain('docs');
  });

  it('imports ignorePatterns array when all entries are strings', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({ ignorePatterns: ['dist', 'node_modules'] }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results.find((r) => r.toPath === AB_IGNORE)).toBeDefined();
    expect(readFileSync(join(TEST_DIR, AB_IGNORE), 'utf-8')).toContain('dist');
    expect(readFileSync(join(TEST_DIR, AB_IGNORE), 'utf-8')).toContain('node_modules');
  });

  it('skips ignorePatterns when any entry is not a string', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({ ignorePatterns: ['dist', 42] }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results.find((r) => r.toPath === AB_IGNORE)).toBeUndefined();
  });

  it('skips hooks block when typeof hooks is not "object"', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(join(TEST_DIR, GEMINI_SETTINGS), JSON.stringify({ hooks: 'not-an-object' }));
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results.find((r) => r.toPath === AB_HOOKS)).toBeUndefined();
  });

  it('imports nested-shape Gemini hooks (matcher + hooks[]) into canonical hooks.yaml', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              matcher: '*',
              hooks: [{ command: 'pnpm lint', timeout: 30 }],
            },
          ],
        },
      }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    const hooksResult = results.find((r) => r.toPath === AB_HOOKS);
    expect(hooksResult).toBeDefined();
    const hooksYaml = readFileSync(join(TEST_DIR, AB_HOOKS), 'utf-8');
    expect(hooksYaml).toContain('PreToolUse');
    expect(hooksYaml).toContain('pnpm lint');
    expect(hooksYaml).toContain('timeout: 30');
  });

  it('imports legacy-shape Gemini hooks (flat command on entry, no nested hooks[])', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          AfterTool: [{ matcher: 'write', command: 'pnpm test' }],
        },
      }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    const hooksResult = results.find((r) => r.toPath === AB_HOOKS);
    expect(hooksResult).toBeDefined();
    const hooksYaml = readFileSync(join(TEST_DIR, AB_HOOKS), 'utf-8');
    expect(hooksYaml).toContain('PostToolUse');
    expect(hooksYaml).toContain('pnpm test');
  });

  it('skips hook events with unknown event names (mapGeminiHookEvent returns null)', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          UnknownEventXYZ: [{ matcher: '*', hooks: [{ command: 'cmd' }] }],
        },
      }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results.find((r) => r.toPath === AB_HOOKS)).toBeUndefined();
  });

  it('skips events whose value is not an array', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: { BeforeTool: { not: 'an-array' } },
      }),
    );
    const results: ImportResult[] = [];
    await importGeminiSettings(TEST_DIR, results);
    expect(results.find((r) => r.toPath === AB_HOOKS)).toBeUndefined();
  });
});
