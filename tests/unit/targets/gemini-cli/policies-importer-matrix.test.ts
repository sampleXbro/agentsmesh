/**
 * Rule-matrix coverage for src/targets/gemini-cli/policies-importer.ts:
 * every toolName/decision arm, argsPattern unescape, commandPrefix trim,
 * dedupe, unparsable TOML, TOML without a `rule` array, and the empty-result exits.
 */
import { AB_PERMISSIONS } from '../../../../src/core/canonical-paths.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { importGeminiPolicies } from '../../../../src/targets/gemini-cli/policies-importer.js';
import {
  GEMINI_TARGET,
  GEMINI_POLICIES_DIR,
} from '../../../../src/targets/gemini-cli/constants.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'am-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

async function writePolicy(name: string, content: string): Promise<void> {
  const dir = join(projectRoot, GEMINI_POLICIES_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), content);
}

async function readPermissions(): Promise<{ allow: string[]; deny: string[] }> {
  const raw = await readFile(join(projectRoot, AB_PERMISSIONS), 'utf-8');
  return parseYaml(raw) as { allow: string[]; deny: string[] };
}

function canonicalDirExists(): boolean {
  return existsSync(join(projectRoot, dirname(AB_PERMISSIONS)));
}

const RULE_MATRIX_TOML = String.raw`
[[rule]]
toolName = "read_file"
decision = "allow"
argsPattern = "src/\\.env"

[[rule]]
toolName = "read_file"
decision = "deny"

[[rule]]
toolName = "grep_search"
decision = "allow"

[[rule]]
toolName = "list_directory"
decision = "allow"

[[rule]]
toolName = "web_fetch"
decision = "allow"

[[rule]]
toolName = "run_shell_command"
decision = "allow"
commandPrefix = " git "

[[rule]]
toolName = "read_file"
decision = "allow"
argsPattern = "   "

[[rule]]
toolName = "run_shell_command"
decision = "allow"

[[rule]]
toolName = "run_shell_command"
decision = "deny"
commandPrefix = "   "

[[rule]]
toolName = "unknown_tool"
decision = "allow"

[[rule]]
toolName = "read_file"

[[rule]]
decision = "allow"

[[rule]]
toolName = 42
decision = "allow"

[[rule]]
toolName = "grep_search"
decision = "ask"

[[rule]]
toolName = "grep_search"
decision = "allow"

[[rule]]
toolName = "read_file"
decision = "deny"
`;

const UNMAPPABLE_TOML = `
[[rule]]
toolName = "unknown_tool"
decision = "allow"

[[rule]]
toolName = "run_shell_command"
decision = "allow"

[[rule]]
toolName = "grep_search"
decision = "ask"
`;

const BROKEN_TOML = '[[rule\ntoolName = = "x"\n';
const NO_RULE_ARRAY_TOML = '[section]\nkey = "value"\n';
const SCALAR_RULE_TOML = 'rule = "not-an-array"\n';
const NON_OBJECT_ENTRIES_TOML = 'rule = [1, 2]\n';

describe('importGeminiPolicies — rule matrix', () => {
  it('maps every supported tool, dedupes, and skips unmappable rules and files', async () => {
    await writePolicy('rules.toml', RULE_MATRIX_TOML);
    await writePolicy('broken.toml', BROKEN_TOML);
    await writePolicy('no-rules.toml', NO_RULE_ARRAY_TOML);
    await writePolicy('scalar.toml', SCALAR_RULE_TOML);
    await writePolicy('numbers.toml', NON_OBJECT_ENTRIES_TOML);
    await writePolicy('empty.toml', '');
    await writePolicy('notes.txt', 'ignored');

    const results = await importGeminiPolicies(projectRoot);

    expect(results).toEqual([
      {
        fromTool: GEMINI_TARGET,
        fromPath: join(projectRoot, GEMINI_POLICIES_DIR),
        toPath: AB_PERMISSIONS,
        feature: 'permissions',
      },
    ]);
    expect(await readPermissions()).toEqual({
      allow: ['Read(src/.env)', 'Grep', 'LS', 'WebFetch', 'Bash(git:*)', 'Read'],
      deny: ['Read'],
    });
  });
});

describe('importGeminiPolicies — nothing to import', () => {
  it('returns [] and writes nothing when the policies dir has no .toml files', async () => {
    await writePolicy('notes.txt', 'ignored');

    expect(await importGeminiPolicies(projectRoot)).toEqual([]);
    expect(canonicalDirExists()).toBe(false);
  });

  it('returns [] and writes nothing when only unmappable rules and bad files exist', async () => {
    await writePolicy('unmappable.toml', UNMAPPABLE_TOML);
    await writePolicy('broken.toml', BROKEN_TOML);
    await writePolicy('no-rules.toml', NO_RULE_ARRAY_TOML);

    expect(await importGeminiPolicies(projectRoot)).toEqual([]);
    expect(canonicalDirExists()).toBe(false);
  });

  it('returns [] when the policies dir does not exist', async () => {
    expect(await importGeminiPolicies(projectRoot)).toEqual([]);
    expect(canonicalDirExists()).toBe(false);
  });
});
