/**
 * Import → Generate round-trip E2E tests.
 *
 * Verifies that for each agent:
 * 1. All possible files can be imported into canonical format
 * 2. From a full canonical set, all expected files are generated for every agent
 *
 * This is the authoritative test for import/generate completeness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../src/core/generate/engine.js';
import type { CanonicalFiles } from '../src/core/types.js';
import type { ValidatedConfig } from '../src/config/core/schema.js';
import { importFromClaudeCode } from '../src/targets/claude-code/importer.js';
import { importFromCursor } from '../src/targets/cursor/importer.js';
import { importFromCopilot } from '../src/targets/copilot/importer.js';
import { importFromContinue } from '../src/targets/continue/importer.js';
import { importFromJunie } from '../src/targets/junie/importer.js';
import { importFromGemini } from '../src/targets/gemini-cli/importer.js';
import { importFromCline } from '../src/targets/cline/importer.js';
import { importFromCodex } from '../src/targets/codex-cli/importer.js';
import { serializeCanonicalRuleToCodexRulesFile } from '../src/targets/codex-cli/codex-rules-embed.js';
import { importFromWindsurf } from '../src/targets/windsurf/importer.js';
import { importFromAntigravity } from '../src/targets/antigravity/importer.js';
import type { BuiltinTargetId } from '../src/targets/catalog/target-ids.js';

const TEST_DIR = join(tmpdir(), 'am-roundtrip-test');

function allFeaturesConfig(targets: BuiltinTargetId[]): ValidatedConfig {
  return {
    version: 1,
    targets,
    features: ['rules', 'commands', 'agents', 'skills', 'mcp', 'permissions', 'hooks', 'ignore'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  };
}

function fullCanonical(): CanonicalFiles {
  return {
    rules: [
      {
        source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
        root: true,
        targets: [],
        description: '',
        globs: [],
        body: '# Project Rules\n\nUse TypeScript strict mode.',
      },
      {
        source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
        root: false,
        targets: [],
        description: 'TypeScript conventions',
        globs: ['**/*.ts'],
        body: 'Always use strict types.',
      },
    ],
    commands: [
      {
        source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
        name: 'review',
        description: 'Run code review',
        allowedTools: ['Read', 'Grep'],
        body: 'Review the current PR for issues.',
      },
    ],
    agents: [
      {
        source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
        name: 'reviewer',
        description: 'Code reviewer',
        tools: ['Read', 'Grep'],
        disallowedTools: [],
        model: 'sonnet',
        permissionMode: '',
        maxTurns: 0,
        mcpServers: [],
        hooks: {},
        skills: [],
        memory: '',
        body: 'You are an expert code reviewer.',
      },
    ],
    skills: [
      {
        source: join(TEST_DIR, '.agentsmesh', 'skills', 'qa', 'SKILL.md'),
        name: 'qa',
        description: 'QA checklist',
        body: 'Run the full QA checklist before marking done.',
        supportingFiles: [],
      },
    ],
    mcp: {
      mcpServers: {
        context7: { type: 'stdio', command: 'npx', args: ['-y', '@ctx/mcp'], env: {} },
      },
    },
    permissions: { allow: ['Read', 'Grep'], deny: ['WebFetch'] },
    hooks: {
      PostToolUse: [{ matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' }],
    },
    ignore: ['node_modules', 'dist', '.env'],
  };
}

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

// ── IMPORT TESTS: verify each agent can have all its files imported ──

describe('import: Claude Code (all features)', () => {
  it('imports rules, commands, agents, skills, mcp (.mcp.json), permissions, hooks, ignore', async () => {
    // Set up all Claude Code files
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.claude', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'rules', 'ts.md'),
      '---\nglobs:\n  - "**/*.ts"\n---\n\nTS rules',
    );
    mkdirSync(join(TEST_DIR, '.claude', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'commands', 'review.md'),
      '---\ndescription: Review\n---\n\nReview code.',
    );
    mkdirSync(join(TEST_DIR, '.claude', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'agents', 'reviewer.md'),
      '---\nname: reviewer\ndescription: Reviews\n---\n\nReview.',
    );
    mkdirSync(join(TEST_DIR, '.claude', 'skills', 'qa'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'skills', 'qa', 'SKILL.md'),
      '---\ndescription: QA\n---\n\nQA checklist.',
    );
    writeFileSync(
      join(TEST_DIR, '.mcp.json'),
      JSON.stringify({ mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Read'], deny: ['WebFetch'] },
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'prettier' }] }],
        },
      }),
    );
    writeFileSync(join(TEST_DIR, '.claudeignore'), 'node_modules\ndist\n');

    const results = await importFromClaudeCode(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual([
      'agents',
      'commands',
      'hooks',
      'ignore',
      'mcp',
      'permissions',
      'rules',
      'skills',
    ]);
  });
});

describe('import: Cursor (all features)', () => {
  it('imports rules, commands, agents, skills, mcp, permissions, hooks, ignore', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'rules', 'ts.mdc'),
      '---\nalwaysApply: false\nglobs:\n  - "**/*.ts"\n---\n\nTS',
    );
    mkdirSync(join(TEST_DIR, '.cursor', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'commands', 'review.md'),
      '---\ndescription: Review\n---\n\nReview.',
    );
    mkdirSync(join(TEST_DIR, '.cursor', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cursor', 'agents', 'reviewer.md'),
      '---\nname: reviewer\n---\n\nReview.',
    );
    mkdirSync(join(TEST_DIR, '.cursor', 'skills'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cursor', 'skills', 'qa.md'), '---\ndescription: QA\n---\n\nQA.');
    writeFileSync(
      join(TEST_DIR, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'cli.json'),
      JSON.stringify({ permissions: { allow: ['Read'], deny: [] } }),
    );
    writeFileSync(
      join(TEST_DIR, '.cursor', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: { postToolUse: [{ matcher: 'Write', type: 'command', command: 'prettier' }] },
      }),
    );
    writeFileSync(join(TEST_DIR, '.cursorignore'), 'node_modules\n');

    const results = await importFromCursor(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual([
      'agents',
      'commands',
      'hooks',
      'ignore',
      'mcp',
      'permissions',
      'rules',
      'skills',
    ]);
  });
});

describe('import: Copilot (rules + commands + agents + skills + hooks)', () => {
  it('imports rules from all paths, commands from prompt files, native agents/skills, and hooks from scripts', async () => {
    mkdirSync(join(TEST_DIR, '.github', 'copilot'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.github', 'copilot-instructions.md'), '# Root\n');
    writeFileSync(
      join(TEST_DIR, '.github', 'copilot', 'review.instructions.md'),
      '---\nglobs: "**/*.ts"\n---\n\nReview.',
    );
    mkdirSync(join(TEST_DIR, '.github', 'prompts'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'prompts', 'review.prompt.md'),
      '---\nagent: agent\ndescription: Review changes\n---\n\nReview the current PR.',
    );
    mkdirSync(join(TEST_DIR, '.github', 'instructions'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'instructions', 'react.md'),
      '---\napplyTo: "**/*.tsx"\n---\n\nReact.',
    );
    mkdirSync(join(TEST_DIR, '.github', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'agents', 'reviewer.agent.md'),
      '---\nname: reviewer\n---\n\nReview with .github/prompts/review.prompt.md.',
    );
    mkdirSync(join(TEST_DIR, '.github', 'skills', 'qa', 'references'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'skills', 'qa', 'SKILL.md'),
      '---\nname: qa\ndescription: QA\n---\n\nFollow .github/copilot/typescript.instructions.md.',
    );
    writeFileSync(
      join(TEST_DIR, '.github', 'skills', 'qa', 'references', 'checklist.md'),
      'See .github/prompts/review.prompt.md.',
    );
    mkdirSync(join(TEST_DIR, '.github', 'copilot-hooks'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.github', 'copilot-hooks', 'PostToolUse-0.sh'),
      '#!/bin/bash\nprettier --write "$FILE"',
    );
    mkdirSync(join(TEST_DIR, '.vscode'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.vscode', 'mcp.json'),
      JSON.stringify({ servers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );

    const results = await importFromCopilot(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual(['agents', 'commands', 'hooks', 'mcp', 'rules', 'skills']);
    expect(results.filter((r) => r.feature === 'rules')).toHaveLength(3);
    expect(results.filter((r) => r.feature === 'commands')).toHaveLength(1);
    expect(results.filter((r) => r.feature === 'skills')).toHaveLength(2);
    expect(results.filter((r) => r.feature === 'mcp')).toHaveLength(1);
  });
});

describe('import: Continue (rules + embedded commands + skills + mcp)', () => {
  it('imports rules, prompt files, embedded skills, and mcp server files', async () => {
    mkdirSync(join(TEST_DIR, '.continue', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.continue', 'prompts'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.continue', 'skills', 'api-gen', 'references'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.continue', 'mcpServers'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.continue', 'rules', 'general.md'), '# Root\n');
    writeFileSync(
      join(TEST_DIR, '.continue', 'rules', 'typescript.md'),
      '---\nglobs:\n  - "**/*.ts"\n---\n\nTS rules',
    );
    writeFileSync(
      join(TEST_DIR, '.continue', 'prompts', 'review.md'),
      [
        '---',
        'description: Review',
        'x-agentsmesh-kind: command',
        'x-agentsmesh-name: review',
        'x-agentsmesh-allowed-tools:',
        '  - Read',
        '---',
        '',
        'Review code.',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(TEST_DIR, '.continue', 'skills', 'api-gen', 'SKILL.md'),
      '---\ndescription: API Gen\n---\n\nUse references/checklist.md.',
    );
    writeFileSync(
      join(TEST_DIR, '.continue', 'skills', 'api-gen', 'references', 'checklist.md'),
      '# Checklist\n',
    );
    writeFileSync(
      join(TEST_DIR, '.continue', 'mcpServers', 'servers.json'),
      JSON.stringify({ mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );

    const results = await importFromContinue(TEST_DIR);
    const features = [...new Set(results.map((result) => result.feature))].sort();
    expect(features).toEqual(['commands', 'mcp', 'rules', 'skills']);
  });
});

describe('import: Junie (rules + skills + mcp + ignore)', () => {
  it('imports current/legacy project guidelines, skills, mcp, and ignore files', async () => {
    mkdirSync(join(TEST_DIR, '.junie', 'mcp'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.junie', 'skills', 'api-gen', 'references'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.junie', 'AGENTS.md'), '# Root\n');
    writeFileSync(
      join(TEST_DIR, '.junie', 'skills', 'api-gen', 'SKILL.md'),
      '---\ndescription: API Gen\n---\n\nUse references/checklist.md.',
    );
    writeFileSync(
      join(TEST_DIR, '.junie', 'skills', 'api-gen', 'references', 'checklist.md'),
      '# Checklist\n',
    );
    writeFileSync(
      join(TEST_DIR, '.junie', 'mcp', 'mcp.json'),
      JSON.stringify({ mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );
    writeFileSync(join(TEST_DIR, '.aiignore'), 'dist\n');

    const results = await importFromJunie(TEST_DIR);
    const features = [...new Set(results.map((result) => result.feature))].sort();
    expect(features).toEqual(['ignore', 'mcp', 'rules', 'skills']);
  });
});

describe('import: Gemini CLI (rules + commands + mcp + hooks + ignore)', () => {
  it('imports all Gemini-supported features', async () => {
    writeFileSync(join(TEST_DIR, 'GEMINI.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.gemini', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.gemini', 'rules', 'ts.md'),
      '---\nglobs:\n  - "**/*.ts"\n---\n\nTS rules',
    );
    mkdirSync(join(TEST_DIR, '.gemini', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.gemini', 'commands', 'lint.md'),
      '---\ndescription: Lint\n---\n\nRun linter.',
    );
    writeFileSync(
      join(TEST_DIR, '.gemini', 'settings.json'),
      JSON.stringify({
        mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } },
        ignorePatterns: ['node_modules', 'dist'],
        hooks: { postToolUse: [{ matcher: 'shell', command: 'echo done' }] },
      }),
    );

    const results = await importFromGemini(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual(['commands', 'hooks', 'ignore', 'mcp', 'rules']);
  });
});

describe('import: Cline (rules + skills + mcp + ignore)', () => {
  it('imports all Cline-supported features', async () => {
    mkdirSync(join(TEST_DIR, '.cline', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cline', 'rules', '_root.md'), '# Root\n');
    writeFileSync(
      join(TEST_DIR, '.cline', 'rules', 'ts.md'),
      '---\nglobs:\n  - "**/*.ts"\n---\n\nTS',
    );
    mkdirSync(join(TEST_DIR, '.cline', 'skills', 'qa'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.cline', 'skills', 'qa', 'SKILL.md'),
      '---\ndescription: QA\n---\n\nQA.',
    );
    writeFileSync(
      join(TEST_DIR, '.cline', 'mcp.json'),
      JSON.stringify({ mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } }),
    );
    writeFileSync(join(TEST_DIR, '.clineignore'), 'dist\n');

    const results = await importFromCline(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual(['ignore', 'mcp', 'rules', 'skills']);
  });
});

describe('import: Codex CLI (rules only)', () => {
  it('imports codex.md as root rule', async () => {
    writeFileSync(join(TEST_DIR, 'codex.md'), '# Codex Rules\n');
    const results = await importFromCodex(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.feature).toBe('rules');
    expect(results[0]!.toPath).toBe('.agentsmesh/rules/_root.md');
  });

  it('falls back to AGENTS.md when codex.md absent', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Agents Rules\n');
    const results = await importFromCodex(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.feature).toBe('rules');
  });

  it('imports .codex/rules/*.md as non-root rules', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.codex', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.codex', 'rules', 'typescript.md'),
      '---\ndescription: TS\n---\n\nUse strict mode.',
    );
    const results = await importFromCodex(TEST_DIR);
    expect(results.filter((r) => r.feature === 'rules')).toHaveLength(2);
    const tsRule = results.find((r) => r.toPath === '.agentsmesh/rules/typescript.md');
    expect(tsRule).toBeDefined();
  });

  it('imports legacy .codex/rules/*.rules with agentsmesh embed as non-root rules', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.codex', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.codex', 'rules', 'typescript.rules'),
      serializeCanonicalRuleToCodexRulesFile({
        description: 'TS',
        globs: ['**/*.ts'],
        body: 'Use strict mode.',
      }),
    );
    const results = await importFromCodex(TEST_DIR);
    expect(results.filter((r) => r.feature === 'rules')).toHaveLength(2);
    const tsRule = results.find((r) => r.toPath === '.agentsmesh/rules/typescript.md');
    expect(tsRule).toBeDefined();
    const imported = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'), 'utf-8');
    expect(imported).toContain('Use strict mode.');
    expect(imported).toContain('**/*.ts');
  });

  it('imports native .codex/rules/*.rules (no embed) as codex_emit: execution', async () => {
    writeFileSync(join(TEST_DIR, 'AGENTS.md'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.codex', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.codex', 'rules', 'policy.rules'),
      'prefix_rule(\n  pattern = ["git"],\n  decision = "allow",\n)\n',
    );
    await importFromCodex(TEST_DIR);
    const imported = readFileSync(join(TEST_DIR, '.agentsmesh', 'rules', 'policy.md'), 'utf-8');
    expect(imported).toContain('codex_emit: execution');
    expect(imported).toContain('prefix_rule');
  });
});

describe('import: Windsurf (rules + workflows + skills + hooks + mcp + ignore)', () => {
  it('imports all Windsurf-supported features', async () => {
    writeFileSync(join(TEST_DIR, '.windsurfrules'), '# Root\n');
    mkdirSync(join(TEST_DIR, '.windsurf', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.windsurf', 'rules', 'ts.md'),
      '---\ntrigger: model_decision\n---\n\nTS rules',
    );
    mkdirSync(join(TEST_DIR, '.windsurf', 'workflows'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.windsurf', 'workflows', 'deploy.md'),
      '---\ndescription: Deploy\n---\n\nDeploy.',
    );
    mkdirSync(join(TEST_DIR, '.windsurf', 'skills', 'qa'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.windsurf', 'skills', 'qa', 'SKILL.md'),
      '---\ndescription: QA\n---\n\nQA.',
    );
    writeFileSync(
      join(TEST_DIR, '.windsurf', 'hooks.json'),
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              { matcher: 'Write', hooks: [{ type: 'command', command: 'npm run lint' }] },
            ],
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(TEST_DIR, '.windsurf', 'mcp_config.example.json'),
      JSON.stringify(
        {
          mcpServers: { context7: { type: 'stdio', command: 'npx', args: ['-y', 'context7'] } },
        },
        null,
        2,
      ),
    );
    writeFileSync(join(TEST_DIR, '.windsurfignore'), 'node_modules\n');

    const results = await importFromWindsurf(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual(['commands', 'hooks', 'ignore', 'mcp', 'rules', 'skills']);
  });
});

describe('import: Antigravity (rules, workflows, skills)', () => {
  it('imports rules, workflows as commands, and skills', async () => {
    mkdirSync(join(TEST_DIR, '.agents', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.agents', 'rules', '_root.md'), '# Root\n\nProject rules.');
    writeFileSync(join(TEST_DIR, '.agents', 'rules', 'ts.md'), '# TypeScript\n\nStrict mode.');
    mkdirSync(join(TEST_DIR, '.agents', 'workflows'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.agents', 'workflows', 'deploy.md'), '# Deploy\n\nDeploy steps.');
    mkdirSync(join(TEST_DIR, '.agents', 'skills', 'qa'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agents', 'skills', 'qa', 'SKILL.md'),
      '---\ndescription: QA\n---\n\nQA.',
    );

    const results = await importFromAntigravity(TEST_DIR);
    const features = [...new Set(results.map((r) => r.feature))].sort();
    expect(features).toEqual(['commands', 'rules', 'skills']);
  });
});

// ── GENERATE TESTS: from full canonical, verify all outputs for each agent ──

describe('generate: full canonical → all agents produce all supported outputs', () => {
  const canonical = fullCanonical();

  it('Claude Code generates all 8 features', async () => {
    const results = await generate({
      config: allFeaturesConfig(['claude-code']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.claude/agents/reviewer.md',
      '.claude/commands/review.md',
      '.claude/rules/typescript.md',
      '.claude/settings.json',
      '.claude/skills/qa/SKILL.md',
      '.mcp.json',
      'CLAUDE.md',
    ]);
    const settingsResults = results.filter((r) => r.path === '.claude/settings.json');
    expect(settingsResults).toHaveLength(1);
    const settings = JSON.parse(settingsResults[0]!.content) as Record<string, unknown>;
    expect(settings.permissions).toBeDefined();
    expect(settings.hooks).toBeDefined();
  });

  it('Cursor generates all features', async () => {
    const results = await generate({
      config: allFeaturesConfig(['cursor']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.cursor/AGENTS.md',
      '.cursor/agents/reviewer.md',
      '.cursor/cli.json',
      '.cursor/commands/review.md',
      '.cursor/hooks.json',
      '.cursor/mcp.json',
      '.cursor/rules/general.mdc',
      '.cursor/rules/typescript.mdc',
      '.cursor/skills/qa/SKILL.md',
      '.cursorignore',
      'AGENTS.md',
    ]);
  });

  it('Copilot generates rules + prompt-file commands + native agents/skills + hooks', async () => {
    const results = await generate({
      config: allFeaturesConfig(['copilot']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.github/agents/reviewer.agent.md',
      '.github/copilot-instructions.md',
      '.github/hooks/agentsmesh.json',
      '.github/hooks/scripts/posttooluse-0.sh',
      '.github/instructions/typescript.instructions.md',
      '.github/prompts/review.prompt.md',
      '.github/skills/qa/SKILL.md',
      '.vscode/mcp.json',
    ]);
    const prompt = results.find((r) => r.path === '.github/prompts/review.prompt.md');
    expect(prompt!.content).toContain('x-agentsmesh-kind: command');
    expect(prompt!.content).toContain('Review the current PR');
    const agentFile = results.find((r) => r.path === '.github/agents/reviewer.agent.md');
    expect(agentFile!.content).toContain('expert code reviewer');
    const skillFile = results.find((r) => r.path === '.github/skills/qa/SKILL.md');
    expect(skillFile!.content).toContain('QA checklist');
  });

  it('Gemini CLI generates rules + commands + settings (mcp/ignore/hooks)', async () => {
    const results = await generate({
      config: allFeaturesConfig(['gemini-cli']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.agents/skills/qa/SKILL.md',
      '.gemini/agents/reviewer.md',
      '.gemini/commands/review.toml',
      '.gemini/settings.json',
      '.gemini/skills/qa/SKILL.md',
      '.geminiignore',
      'AGENTS.md',
      'GEMINI.md',
    ]);
    const settings = results.find((r) => r.path === '.gemini/settings.json');
    const parsed = JSON.parse(settings!.content) as Record<string, unknown>;
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.hooks).toBeDefined();
  });

  it('Cline generates rules + AGENTS.md + skills + mcp + ignore', async () => {
    const results = await generate({
      config: allFeaturesConfig(['cline']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.cline/agents.yaml',
      '.cline/hooks/posttooluse-0.sh',
      '.cline/mcp.json',
      '.cline/rules/typescript.md',
      '.cline/skills/qa/SKILL.md',
      '.clineignore',
      '.clinerules/workflows/review.md',
      'AGENTS.md',
    ]);
  });

  it('Codex CLI generates AGENTS.md + nested AGENTS.md + .codex/agents/*.toml + skills + MCP + permissions', async () => {
    const results = await generate({
      config: allFeaturesConfig(['codex-cli']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.agents/skills/am-command-review/SKILL.md',
      '.agents/skills/qa/SKILL.md',
      '.codex/agents/reviewer.toml',
      '.codex/config.toml',
      '.codex/hooks.json',
      '.codex/rules/agentsmesh-permissions.rules',
      'AGENTS.md',
    ]);
  });

  it('Windsurf generates rules + workflows + skills + hooks + mcp + ignore', async () => {
    const results = await generate({
      config: allFeaturesConfig(['windsurf']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.codeiumignore',
      '.windsurf/hooks.json',
      '.windsurf/mcp_config.example.json',
      '.windsurf/rules/typescript.md',
      '.windsurf/skills/am-agent-reviewer/SKILL.md',
      '.windsurf/skills/qa/SKILL.md',
      '.windsurf/workflows/review.md',
      'AGENTS.md',
    ]);
  });

  it('Continue generates rules + prompts + agents + hooks + skills + mcp + ignore', async () => {
    const results = await generate({
      config: allFeaturesConfig(['continue']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((result) => result.path).sort();
    expect(paths).toEqual([
      '.continue/agents/reviewer.md',
      '.continue/mcpServers/agentsmesh.json',
      '.continue/prompts/review.md',
      '.continue/rules/general.md',
      '.continue/rules/typescript.md',
      '.continue/settings.json',
      '.continue/skills/qa/SKILL.md',
      '.continueignore',
    ]);
  });

  it('Junie generates rules, commands, agents, embedded skills, mcp, and ignore', async () => {
    const results = await generate({
      config: allFeaturesConfig(['junie']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((result) => result.path).sort();
    expect(paths).toEqual([
      '.aiignore',
      '.junie/AGENTS.md',
      '.junie/agents/reviewer.md',
      '.junie/commands/review.md',
      '.junie/mcp/mcp.json',
      '.junie/rules/typescript.md',
      '.junie/skills/qa/SKILL.md',
    ]);
  });

  it('Antigravity generates rules + workflows + skills', async () => {
    const results = await generate({
      config: allFeaturesConfig(['antigravity']),
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      '.agents/agents/reviewer.md',
      '.agents/hooks.json',
      '.agents/mcp_config.json',
      '.agents/rules/general.md',
      '.agents/rules/typescript.md',
      '.agents/skills/qa/SKILL.md',
      '.agents/workflows/review.md',
      '.antigravityignore',
    ]);
  });

  it('all 10 agents together produce all expected files', async () => {
    const allTargets: BuiltinTargetId[] = [
      'claude-code',
      'cursor',
      'copilot',
      'continue',
      'junie',
      'gemini-cli',
      'cline',
      'codex-cli',
      'windsurf',
      'antigravity',
    ];
    const results = await generate({
      config: allFeaturesConfig(allTargets),
      canonical,
      projectRoot: TEST_DIR,
    });

    const allPaths = results.map((r) => r.path).sort();
    expect(allPaths).toEqual([
      '.agents/agents/reviewer.md',
      '.agents/hooks.json',
      '.agents/mcp_config.json',
      '.agents/rules/general.md',
      '.agents/rules/typescript.md',
      '.agents/skills/am-command-review/SKILL.md',
      '.agents/skills/qa/SKILL.md',
      '.agents/workflows/review.md',
      '.aiignore',
      '.antigravityignore',
      '.claude/agents/reviewer.md',
      '.claude/commands/review.md',
      '.claude/rules/typescript.md',
      '.claude/settings.json',
      '.claude/skills/qa/SKILL.md',
      '.cline/agents.yaml',
      '.cline/hooks/posttooluse-0.sh',
      '.cline/mcp.json',
      '.cline/rules/typescript.md',
      '.cline/skills/qa/SKILL.md',
      '.clineignore',
      '.clinerules/workflows/review.md',
      '.codeiumignore',
      '.codex/agents/reviewer.toml',
      '.codex/config.toml',
      '.codex/hooks.json',
      '.codex/rules/agentsmesh-permissions.rules',
      '.continue/agents/reviewer.md',
      '.continue/mcpServers/agentsmesh.json',
      '.continue/prompts/review.md',
      '.continue/rules/general.md',
      '.continue/rules/typescript.md',
      '.continue/settings.json',
      '.continue/skills/qa/SKILL.md',
      '.continueignore',
      '.cursor/AGENTS.md',
      '.cursor/agents/reviewer.md',
      '.cursor/cli.json',
      '.cursor/commands/review.md',
      '.cursor/hooks.json',
      '.cursor/mcp.json',
      '.cursor/rules/general.mdc',
      '.cursor/rules/typescript.mdc',
      '.cursor/skills/qa/SKILL.md',
      '.cursorignore',
      '.gemini/agents/reviewer.md',
      '.gemini/commands/review.toml',
      '.gemini/settings.json',
      '.gemini/skills/qa/SKILL.md',
      '.geminiignore',
      '.github/agents/reviewer.agent.md',
      '.github/copilot-instructions.md',
      '.github/hooks/agentsmesh.json',
      '.github/hooks/scripts/posttooluse-0.sh',
      '.github/instructions/typescript.instructions.md',
      '.github/prompts/review.prompt.md',
      '.github/skills/qa/SKILL.md',
      '.junie/AGENTS.md',
      '.junie/agents/reviewer.md',
      '.junie/commands/review.md',
      '.junie/mcp/mcp.json',
      '.junie/rules/typescript.md',
      '.junie/skills/qa/SKILL.md',
      '.mcp.json',
      '.vscode/mcp.json',
      '.windsurf/hooks.json',
      '.windsurf/mcp_config.example.json',
      '.windsurf/rules/typescript.md',
      '.windsurf/skills/am-agent-reviewer/SKILL.md',
      '.windsurf/skills/qa/SKILL.md',
      '.windsurf/workflows/review.md',
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
  });
});
