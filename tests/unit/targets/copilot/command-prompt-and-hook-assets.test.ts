import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commandPromptPath,
  parseCommandPromptFrontmatter,
  serializeCommandPrompt,
  serializeImportedCommand,
} from '../../../../src/targets/copilot/command-prompt.js';
import { addHookScriptAssets } from '../../../../src/targets/copilot/hook-assets.js';
import { wrapperScriptName } from '../../../../src/targets/copilot/hook-format.js';
import type { CanonicalCommand, CanonicalFiles } from '../../../../src/core/types.js';

function makeCommand(partial: Partial<CanonicalCommand> = {}): CanonicalCommand {
  return {
    source: '.agentsmesh/commands/foo.md',
    name: 'foo',
    description: '',
    allowedTools: [],
    body: 'body',
    ...partial,
  };
}

function makeCanonical(partial: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...partial,
  };
}

describe('commandPromptPath', () => {
  it('builds the .github prompt path', () => {
    expect(commandPromptPath('foo')).toBe('.github/prompts/foo.prompt.md');
  });
});

describe('serializeCommandPrompt', () => {
  it('omits empty description and empty allowed-tools', () => {
    const out = serializeCommandPrompt(makeCommand({ description: '', allowedTools: [] }));
    expect(out).not.toContain('description:');
    expect(out).not.toContain('x-agentsmesh-allowed-tools:');
    expect(out).toContain('agent: agent');
    expect(out).toContain('x-agentsmesh-name: foo');
  });

  it('keeps description and allowed-tools when set', () => {
    const out = serializeCommandPrompt(
      makeCommand({ description: 'd', allowedTools: ['Read', 'Bash'] }),
    );
    expect(out).toContain('description: d');
    expect(out).toContain('x-agentsmesh-allowed-tools:');
    expect(out).toContain('Read');
  });

  it('uses empty body when body is whitespace', () => {
    const out = serializeCommandPrompt(makeCommand({ body: '  \n  ' }));
    expect(out).toContain('---');
  });
});

describe('parseCommandPromptFrontmatter', () => {
  it('uses x-agentsmesh-name when present', () => {
    const parsed = parseCommandPromptFrontmatter(
      { 'x-agentsmesh-name': 'meta-name' },
      '/abs/.github/prompts/file.prompt.md',
    );
    expect(parsed.name).toBe('meta-name');
  });

  it('falls back to filename when metadata name is missing', () => {
    const parsed = parseCommandPromptFrontmatter(
      {},
      '/abs/.github/prompts/from-filename.prompt.md',
    );
    expect(parsed.name).toBe('from-filename');
  });

  it('uses metadata allowed-tools when array of strings', () => {
    const parsed = parseCommandPromptFrontmatter(
      { 'x-agentsmesh-allowed-tools': ['Read', 'Grep'] },
      'a.prompt.md',
    );
    expect(parsed.allowedTools).toEqual(['Read', 'Grep']);
  });

  it('parses comma-separated string for allowed-tools', () => {
    const parsed = parseCommandPromptFrontmatter(
      { 'x-agentsmesh-allowed-tools': 'Read, Grep, Bash' },
      'a.prompt.md',
    );
    expect(parsed.allowedTools).toEqual(['Read', 'Grep', 'Bash']);
  });

  it('falls back to top-level tools when metadata allowed-tools missing', () => {
    const parsed = parseCommandPromptFrontmatter({ tools: ['Read'] }, 'a.prompt.md');
    expect(parsed.allowedTools).toEqual(['Read']);
  });

  it('returns empty allowedTools when neither metadata nor tools set', () => {
    const parsed = parseCommandPromptFrontmatter({}, 'a.prompt.md');
    expect(parsed.allowedTools).toEqual([]);
  });

  it('filters out non-string array entries and empty strings', () => {
    const parsed = parseCommandPromptFrontmatter(
      { 'x-agentsmesh-allowed-tools': ['Read', '', 42, null, 'Grep'] },
      'a.prompt.md',
    );
    expect(parsed.allowedTools).toEqual(['Read', 'Grep']);
  });

  it('parses non-array, non-string allowed-tools as empty', () => {
    const parsed = parseCommandPromptFrontmatter(
      { 'x-agentsmesh-allowed-tools': 42 },
      'a.prompt.md',
    );
    expect(parsed.allowedTools).toEqual([]);
  });

  it('parses non-string description as empty', () => {
    const parsed = parseCommandPromptFrontmatter({ description: 42 }, 'a.prompt.md');
    expect(parsed.description).toBe('');
  });
});

describe('serializeImportedCommand', () => {
  it('serializes description and allowed-tools', () => {
    const out = serializeImportedCommand(
      { name: 'n', description: 'd', allowedTools: ['Read'] },
      'body',
    );
    expect(out).toContain('description: d');
    expect(out).toContain('allowed-tools:');
    expect(out).toContain('Read');
    expect(out).toContain('body');
  });

  it('uses empty body when body is whitespace', () => {
    const out = serializeImportedCommand(
      { name: 'n', description: '', allowedTools: [] },
      '  \n   ',
    );
    // Body trimmed to empty — no non-frontmatter content remains
    const afterFrontmatter = out.split(/^---\n[\s\S]*?\n---\n/m)[1];
    expect(afterFrontmatter?.trim() ?? '').toBe('');
  });
});

describe('addHookScriptAssets', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'amesh-copilot-hooks-'));
  });

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    projectRoot = '';
  });

  it('returns outputs unchanged when canonical.hooks is null', async () => {
    const outputs = [{ path: '.github/foo.md', content: 'x' }];
    const result = await addHookScriptAssets(projectRoot, makeCanonical({ hooks: null }), outputs);
    expect(result).toEqual(outputs);
  });

  it('skips events whose entries are not arrays', async () => {
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        // @ts-expect-error intentionally wrong shape
        hooks: { PreToolUse: 'not-array' },
      }),
      [],
    );
    expect(result).toEqual([]);
  });

  it('skips entries with no command', async () => {
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        hooks: {
          PreToolUse: [{ matcher: '*', type: 'command', command: '' }],
        },
      }),
      [],
    );
    expect(result).toEqual([]);
  });

  it('emits wrapper script for inline command entries (no asset)', async () => {
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        hooks: {
          PreToolUse: [{ matcher: 'src/*.ts', type: 'command', command: 'pnpm lint' }],
        },
      }),
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe('.github/hooks/scripts/pretooluse-0.sh');
    expect(result[0]!.content).toContain('pnpm lint');
    expect(result[0]!.content).toContain('agentsmesh-matcher: src/*.ts');
  });

  it('produces an asset when command references an existing local script', async () => {
    const scriptDir = join(projectRoot, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(join(scriptDir, 'lint.sh'), '#!/bin/sh\necho hi');
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        hooks: {
          PreToolUse: [{ matcher: '*', type: 'command', command: 'bash scripts/lint.sh --foo' }],
        },
      }),
      [],
    );
    expect(result.length).toBe(2);
    const wrapper = result.find((r) => r.path.includes('scripts/pretooluse-'));
    const asset = result.find((r) => r.path === '.github/hooks/scripts/scripts/lint.sh');
    expect(wrapper).toBeDefined();
    expect(asset).toBeDefined();
    expect(wrapper!.content).toContain('"$HOOK_DIR/scripts/lint.sh"');
  });

  it('does not deduplicate asset across multiple references (single asset emitted)', async () => {
    const scriptDir = join(projectRoot, 'scripts');
    mkdirSync(scriptDir, { recursive: true });
    writeFileSync(join(scriptDir, 'lint.sh'), '#!/bin/sh\necho hi');
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        hooks: {
          PreToolUse: [
            { matcher: '*', type: 'command', command: 'bash scripts/lint.sh' },
            { matcher: '*', type: 'command', command: 'bash scripts/lint.sh' },
          ],
        },
      }),
      [],
    );
    const assets = result.filter((r) => r.path === '.github/hooks/scripts/scripts/lint.sh');
    expect(assets).toHaveLength(1);
  });

  it('uses safe phase name with non-alphanumeric chars replaced', () => {
    expect(wrapperScriptName('My Hook!', 0)).toBe('my-hook--0.sh');
  });

  it('writes no wrapper for an event the hooks config never references', async () => {
    const result = await addHookScriptAssets(
      projectRoot,
      makeCanonical({
        hooks: {
          'My Hook!': [{ matcher: '*', type: 'command', command: 'echo' }],
        },
      }),
      [],
    );
    expect(result).toEqual([]);
  });
});
