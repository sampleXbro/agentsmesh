/**
 * Agent folder structure tests — aligned with docs/agents-folder-structure-research.md
 *
 * Verifies that each agent generates the expected project paths per the research doc.
 * Covers Claude Code, Cursor, Copilot, Gemini CLI, Cline, Codex CLI, Windsurf, Antigravity, and Kiro.
 *
 * Implementation gaps (research doc paths we intentionally don't generate):
 * - Claude: .claude/settings.local.json (user-specific)
 * - Cursor: .cursorrules (legacy; we use .cursor/rules/), .cursor/sandbox.json and .cursor/environment.json (no canonical schema yet)
 * - Copilot: .github/copilot/pull_request_review.json
 * - Gemini: .gemini/.env, .gemini/system.md, .gemini/sandbox-* (skills now supported)
 * - Cline: standalone CLI paths per docs.cline.bot/cli/cli-reference (.cline/rules/,
 *   .cline/hooks/, .cline/skills/, .cline/mcp.json, .cline/agents.yaml); the legacy
 *   flat-file `.clinerules` convention is no longer generated or imported.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../src/core/generate/engine.js';
import type { CanonicalFiles } from '../src/core/types.js';
import type { ValidatedConfig } from '../src/config/core/schema.js';
import type { Hooks } from '../src/core/hook-types.js';

const TEST_DIR = join(tmpdir(), 'am-agents-folder-structure-test');

function canonicalWithRoot(body: string): CanonicalFiles {
  return {
    rules: [
      {
        source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
        root: true,
        targets: [],
        description: '',
        globs: [],
        body,
      },
    ],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

function fullCanonical(opts: {
  rootBody: string;
  nonRootRules?: Array<{ source: string; body: string; globs?: string[]; targets?: string[] }>;
  commands?: Array<{ name: string; description: string; body: string }>;
  agents?: Array<{
    name: string;
    description: string;
    body: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: string;
    permissionMode?: string;
    maxTurns?: number;
    hooks?: Hooks;
    skills?: string[];
    memory?: string;
  }>;
  skills?: Array<{ name: string; description: string; body: string }>;
  mcp?: CanonicalFiles['mcp'];
  permissions?: CanonicalFiles['permissions'];
  hooks?: CanonicalFiles['hooks'];
  ignore?: string[];
}): CanonicalFiles {
  const rules: CanonicalFiles['rules'] = [
    {
      source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      root: true,
      targets: [],
      description: '',
      globs: [],
      body: opts.rootBody,
    },
  ];
  for (const r of opts.nonRootRules ?? []) {
    rules.push({
      source: r.source,
      root: false,
      targets: r.targets ?? [],
      description: '',
      globs: r.globs ?? [],
      body: r.body,
    });
  }
  return {
    rules,
    commands:
      opts.commands?.map((c) => ({
        source: join(TEST_DIR, '.agentsmesh', 'commands', `${c.name}.md`),
        name: c.name,
        description: c.description,
        allowedTools: [],
        body: c.body,
      })) ?? [],
    agents:
      opts.agents?.map((a) => ({
        source: join(TEST_DIR, '.agentsmesh', 'agents', `${a.name}.md`),
        name: a.name,
        description: a.description,
        tools: a.tools ?? [],
        disallowedTools: a.disallowedTools ?? [],
        model: a.model ?? '',
        permissionMode: a.permissionMode ?? '',
        maxTurns: a.maxTurns ?? 0,
        mcpServers: [],
        hooks: a.hooks ?? {},
        skills: a.skills ?? [],
        memory: a.memory ?? '',
        body: a.body,
      })) ?? [],
    skills:
      opts.skills?.map((s) => ({
        source: join(TEST_DIR, '.agentsmesh', 'skills', s.name, 'SKILL.md'),
        name: s.name,
        description: s.description,
        body: s.body,
        supportingFiles: [],
      })) ?? [],
    mcp: opts.mcp ?? null,
    permissions: opts.permissions ?? null,
    hooks: opts.hooks ?? null,
    ignore: opts.ignore ?? [],
  };
}

function config(overrides: Partial<ValidatedConfig> = {}): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code', 'cursor', 'copilot', 'gemini-cli', 'cline', 'codex-cli', 'windsurf'],
    features: ['rules', 'commands', 'agents', 'skills', 'mcp', 'permissions', 'hooks', 'ignore'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    ...overrides,
  };
}

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('agents-folder-structure-research: Claude Code (docs §1)', () => {
  const EXPECTED_PATHS = {
    rules: 'CLAUDE.md', // research: root CLAUDE.md (primary)
    settings: '.claude/settings.json',
    mcp: '.mcp.json',
    agents: '.claude/agents/',
    skills: '.claude/skills/',
    rulesDir: '.claude/rules/',
    commandsDir: '.claude/commands/',
    ignore: '.claudeignore',
  };
  // Gaps: .claude/settings.local.json (user-specific, not committed)

  it('generates root CLAUDE.md from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Project Rules'),
      projectRoot: TEST_DIR,
    });
    const r = results.find((x) => x.path === EXPECTED_PATHS.rules);
    expect(r).toBeDefined();
    expect(r!.content).toContain('Project Rules');
  });

  it('generates .claude/rules/*.md for non-root rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'Use TypeScript',
          globs: ['**/*.ts'],
          targets: [],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((x) => x.path === '.claude/rules/ts.md');
    expect(tsRule).toBeDefined();
    expect(tsRule!.content).toContain('Use TypeScript');
  });

  it('generates .claude/settings.json for permissions', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      permissions: { allow: ['Read'], deny: [] },
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'permissions'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === EXPECTED_PATHS.settings);
    expect(s).toBeDefined();
    expect(JSON.parse(s!.content).permissions).toEqual({
      allow: ['Read'],
      deny: [],
      ask: [],
    });
  });

  it('generates .mcp.json for MCP config', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx-mcp'], env: {} },
        },
      },
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'mcp'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const m = results.find((x) => x.path === EXPECTED_PATHS.mcp);
    expect(m).toBeDefined();
    expect(JSON.parse(m!.content).mcpServers).toBeDefined();
  });

  it('generates .claude/agents/*.md for agents (research §1: description, tools, model in frontmatter)', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      agents: [
        {
          name: 'reviewer',
          description: 'Review code changes',
          body: 'Review code.',
          tools: ['Read', 'Grep'],
          model: 'sonnet',
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'agents'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const a = results.find((x) => x.path === '.claude/agents/reviewer.md');
    expect(a).toBeDefined();
    // body content
    expect(a!.content).toContain('Review code.');
    // frontmatter fields per research doc §1
    expect(a!.content).toContain('description:');
    expect(a!.content).toContain('Review code changes');
    expect(a!.content).toContain('model: sonnet');
    expect(a!.content).toContain('Read');
    expect(a!.content).toContain('Grep');
  });

  it('generates .claude/agents/*.md with optional fields (research §1: hooks, skills, memory)', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      agents: [
        {
          name: 'helper',
          description: 'Helper agent',
          body: 'Help user.',
          tools: ['Read'],
          model: 'haiku',
          disallowedTools: ['Write'],
          permissionMode: 'ask',
          maxTurns: 5,
          hooks: { PostToolUse: [{ matcher: 'Bash', command: 'echo done' }] },
          skills: ['qa'],
          memory: 'Remember context',
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'agents'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const a = results.find((x) => x.path === '.claude/agents/helper.md');
    expect(a).toBeDefined();
    expect(a!.content).toContain('disallowedTools:');
    expect(a!.content).toContain('Write');
    expect(a!.content).toContain('permissionMode: ask');
    expect(a!.content).toContain('maxTurns: 5');
    expect(a!.content).toContain('hooks:');
    expect(a!.content).toContain('skills:');
    expect(a!.content).toContain('memory:');
  });

  it('generates .claude/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'qa', description: 'QA', body: 'Run QA checklist.' }],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === '.claude/skills/qa/SKILL.md');
    expect(s).toBeDefined();
    expect(s!.content).toContain('Run QA checklist.');
  });

  it('generates .claude/commands/*.md for commands', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'review', description: 'Code review', body: 'Review the PR.' }],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const cmd = results.find((x) => x.path === '.claude/commands/review.md');
    expect(cmd).toBeDefined();
    expect(cmd!.content).toContain('Review the PR.');
  });

  it('generates .claude/settings.json for hooks', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: 'echo pre' }],
      },
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'hooks'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === EXPECTED_PATHS.settings);
    expect(s).toBeDefined();
    const parsed = JSON.parse(s!.content) as Record<string, unknown>;
    expect(parsed.hooks).toBeDefined();
  });

  it('generates .claudeignore for ignore patterns', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      ignore: ['node_modules', 'dist'],
    });
    const results = await generate({
      config: config({ targets: ['claude-code'], features: ['rules', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const i = results.find((x) => x.path === EXPECTED_PATHS.ignore);
    expect(i).toBeDefined();
    expect(i!.content).toContain('node_modules');
  });
});

describe('agents-folder-structure-research: Cursor (docs §2)', () => {
  const EXPECTED_PATHS = {
    agentsMd: 'AGENTS.md', // compatibility mirror (§3.1 of cursor format doc)
    rules: '.cursor/rules/general.mdc', // research: .cursor/rules/*.mdc — root maps to general.mdc
    mcp: '.cursor/mcp.json',
    ignore: '.cursorignore',
    commands: '.cursor/commands/',
    agents: '.cursor/agents/',
    skills: '.cursor/skills/',
    // Gaps: .cursor/sandbox.json, .cursor/environment.json (no canonical schema yet)
    // Permissions: native — emitted to .cursor/cli.json (project) or ~/.cursor/cli-config.json (global)
    // Not emitted: .cursorindexingignore (community-sourced, not official)
  };
  // Gaps: .cursorrules (legacy — we generate .cursor/rules/)

  it('generates AGENTS.md compatibility mirror and .cursor/rules/general.mdc from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Cursor Rules'),
      projectRoot: TEST_DIR,
    });
    const agentsMd = results.find((x) => x.path === EXPECTED_PATHS.agentsMd);
    expect(agentsMd).toBeDefined();
    expect(agentsMd!.content).toContain('Cursor Rules');
    expect(agentsMd!.content).not.toContain('alwaysApply');
    const r = results.find((x) => x.path === EXPECTED_PATHS.rules);
    expect(r).toBeDefined();
    expect(r!.content).toContain('alwaysApply: true');
    expect(r!.content).toContain('Cursor Rules');
  });

  it('generates .cursor/rules/*.mdc for non-root rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TypeScript rules',
          globs: ['**/*.ts'],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((x) => x.path === '.cursor/rules/ts.mdc');
    expect(tsRule).toBeDefined();
  });

  it('generates .cursor/mcp.json for MCP config', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx-mcp'], env: {} },
        },
      },
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'mcp'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const m = results.find((x) => x.path === EXPECTED_PATHS.mcp);
    expect(m).toBeDefined();
  });

  it('generates .cursor/commands/*.md for commands', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'deploy', description: 'Deploy', body: 'Deploy steps.' }],
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const cmd = results.find((x) => x.path === '.cursor/commands/deploy.md');
    expect(cmd).toBeDefined();
    expect(cmd!.content).toContain('Deploy steps.');
  });

  it('generates .cursor/agents/*.md for agents (research §2: description, tools, model in frontmatter)', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      agents: [
        {
          name: 'reviewer',
          description: 'Review code changes',
          body: 'Review code.',
          tools: ['Read', 'Grep'],
          model: 'sonnet',
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'agents'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const a = results.find((x) => x.path === '.cursor/agents/reviewer.md');
    expect(a).toBeDefined();
    // body content
    expect(a!.content).toContain('Review code.');
    // frontmatter fields per research doc §2
    expect(a!.content).toContain('description:');
    expect(a!.content).toContain('Review code changes');
    expect(a!.content).toContain('model: sonnet');
    expect(a!.content).toContain('Read');
    expect(a!.content).toContain('Grep');
  });

  it('generates .cursor/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'qa', description: 'QA', body: 'QA checklist.' }],
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === '.cursor/skills/qa/SKILL.md');
    expect(s).toBeDefined();
    expect(s!.content).toContain('QA checklist.');
  });

  it('emits .cursor/cli.json for permissions (native capability) and never .cursor/settings.json', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      permissions: { allow: ['Read'], deny: [] },
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'permissions'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    // Positive assertion: the native permissions file must be present
    const cliJson = results.find((r) => r.path === '.cursor/cli.json');
    expect(cliJson).toBeDefined();
    const parsed = JSON.parse(cliJson!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('permissions');
    expect((parsed.permissions as Record<string, unknown>).allow).toEqual(['Read']);
    // settings.json must not appear — permissions are not stored there
    expect(results.every((r) => r.path !== '.cursor/settings.json')).toBe(true);
  });

  it('generates .cursor/hooks.json for hooks', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      hooks: {
        PostToolUse: [{ matcher: 'Bash', command: 'echo done' }],
      },
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'hooks'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const h = results.find((x) => x.path === '.cursor/hooks.json');
    expect(h).toBeDefined();
    const parsed = JSON.parse(h!.content) as Record<string, unknown>;
    expect(parsed.hooks).toBeDefined();
  });

  it('generates .cursorignore for ignore patterns', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      ignore: ['node_modules'],
    });
    const results = await generate({
      config: config({ targets: ['cursor'], features: ['rules', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const i = results.find((x) => x.path === EXPECTED_PATHS.ignore);
    expect(i).toBeDefined();
  });
});

describe('agents-folder-structure-research: GitHub Copilot (docs §3)', () => {
  const EXPECTED_PATHS = {
    instructions: '.github/copilot-instructions.md', // research: .github/copilot-instructions.md
    instructionsDir: '.github/instructions/', // research: .github/instructions/*.instructions.md (scoped)
    promptsDir: '.github/prompts/', // research: .github/prompts/*.prompt.md
  };
  // Gaps: .github/copilot/pull_request_review.json (PR review config)

  it('generates .github/copilot-instructions.md from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['copilot'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Copilot Instructions'),
      projectRoot: TEST_DIR,
    });
    const r = results.find((x) => x.path === EXPECTED_PATHS.instructions);
    expect(r).toBeDefined();
    expect(r!.content).toContain('Copilot Instructions');
  });

  it('generates .github/instructions/*.instructions.md for non-root contextual rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'style.md'),
          body: 'Follow style guide',
          globs: ['src/**/*.ts'],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['copilot'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const ctx = results.find((x) => x.path.startsWith('.github/instructions/'));
    expect(ctx).toBeDefined();
    expect(ctx!.path).toBe('.github/instructions/style.instructions.md');
  });

  it('generates .github/hooks JSON config plus wrapper scripts for hooks', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      hooks: {
        PostToolUse: [{ matcher: 'Bash', command: 'echo done' }],
      },
    });
    const results = await generate({
      config: config({ targets: ['copilot'], features: ['rules', 'hooks'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const hookConfig = results.find((x) => x.path === '.github/hooks/agentsmesh.json');
    const scriptPaths = results
      .filter((x) => x.path.startsWith('.github/hooks/scripts/'))
      .map((x) => x.path)
      .sort();
    const script = results.find((x) => x.path === '.github/hooks/scripts/posttooluse-0.sh');
    expect(hookConfig).toBeDefined();
    expect(hookConfig!.content).toContain('postToolUse');
    expect(scriptPaths).toEqual(['.github/hooks/scripts/posttooluse-0.sh']);
    expect(script).toBeDefined();
    expect(script!.content).toContain('echo done');
  });

  it('generates prompt files for commands; agents and skills remain in native paths', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'review', description: 'Review', body: 'Review code.' }],
      agents: [{ name: 'helper', description: 'Helper', body: 'Help user.' }],
      skills: [{ name: 'qa', description: 'QA', body: 'QA checklist.' }],
    });
    const results = await generate({
      config: config({
        targets: ['copilot'],
        features: ['rules', 'commands', 'agents', 'skills'],
      }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const main = results.find((x) => x.path === EXPECTED_PATHS.instructions);
    expect(main).toBeDefined();
    const prompt = results.find((x) => x.path === '.github/prompts/review.prompt.md');
    expect(prompt).toBeDefined();
    expect(prompt!.content).toContain('Review code.');
    expect(main!.content).not.toContain('Help user.');
    const agentFile = results.find((x) => x.path === '.github/agents/helper.agent.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('Help user.');
    const skillFile = results.find((x) => x.path === '.github/skills/qa/SKILL.md');
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('QA checklist.');
  });

  it('generates .github/instructions/*.instructions.md for scoped rules with globs', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TypeScript hints',
          globs: ['**/*.ts'],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['copilot'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const scoped = results.find((x) => x.path.startsWith('.github/instructions/'));
    expect(scoped).toBeDefined();
    expect(scoped!.path).toBe('.github/instructions/ts.instructions.md');
  });
});

describe('agents-folder-structure-research: Gemini CLI (docs §4)', () => {
  const EXPECTED_PATHS = {
    root: 'GEMINI.md', // research: GEMINI.md
    settings: '.gemini/settings.json', // research: .gemini/settings.json
    commandsDir: '.gemini/commands/',
    skillsDir: '.gemini/skills/', // compatibility mirror per docs §9
  };
  // Gaps: .gemini/.env, .gemini/system.md, .gemini/sandbox-* (advanced config)

  it('generates GEMINI.md from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['gemini-cli'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Gemini Rules'),
      projectRoot: TEST_DIR,
    });
    const r = results.find((x) => x.path === EXPECTED_PATHS.root);
    expect(r).toBeDefined();
    expect(r!.content).toContain('Gemini Rules');
  });

  it('folds non-root rules as sections into GEMINI.md (no .gemini/rules/ dir)', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TS rules',
          globs: ['**/*.ts'],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['gemini-cli'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    // Only GEMINI.md — no separate .gemini/rules/ files
    const ruleFiles = results.filter(
      (x) => x.path === 'GEMINI.md' || x.path.startsWith('.gemini/rules/'),
    );
    expect(ruleFiles.length).toBe(1);
    const geminiMd = results.find((x) => x.path === EXPECTED_PATHS.root);
    expect(geminiMd).toBeDefined();
    expect(geminiMd!.content).toContain('# Root');
    expect(geminiMd!.content).toContain('TS rules');
    expect(results.some((x) => x.path.startsWith('.gemini/rules/'))).toBe(false);
  });

  it('generates .gemini/commands/*.toml for commands', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'lint', description: 'Lint', body: 'Run linter.' }],
    });
    const results = await generate({
      config: config({ targets: ['gemini-cli'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const cmd = results.find((x) => x.path === '.gemini/commands/lint.toml');
    expect(cmd).toBeDefined();
    expect(cmd!.content).toContain('Run linter.');
  });

  it('generates .gemini/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'qa', description: 'QA', body: 'Run QA checklist.' }],
    });
    const results = await generate({
      config: config({ targets: ['gemini-cli'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === '.gemini/skills/qa/SKILL.md');
    expect(s).toBeDefined();
    expect(s!.content).toContain('Run QA checklist.');
  });

  it('generates .gemini/settings.json for MCP/hooks and .geminiignore for ignore', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} },
        },
      },
      ignore: ['node_modules'],
    });
    const results = await generate({
      config: config({ targets: ['gemini-cli'], features: ['rules', 'mcp', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === EXPECTED_PATHS.settings);
    const ignore = results.find((x) => x.path === '.geminiignore');
    expect(s).toBeDefined();
    const parsed = JSON.parse(s!.content) as Record<string, unknown>;
    expect(parsed.mcpServers).toBeDefined();
    expect(ignore).toBeDefined();
    expect(ignore!.content).toContain('node_modules');
  });
});

describe('agents-folder-structure-research: Cline (docs.cline.bot/cli/cli-reference)', () => {
  const EXPECTED_PATHS = {
    rulesDir: '.cline/rules/', // CLI docs: `.cline/rules/` (directory-based, project-only)
    ignore: '.clineignore', // docs.cline.bot/customization/clineignore: project-only, no global equivalent
    mcp: '.cline/mcp.json', // CLI docs: `.cline/mcp.json` (project-only)
    skillsDir: '.cline/skills/',
  };

  it('generates AGENTS.md from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Cline Root'),
      projectRoot: TEST_DIR,
    });
    const r = results.find((x) => x.path === 'AGENTS.md');
    expect(r).toBeDefined();
    expect(r!.content).toContain('Cline Root');
  });

  it('generates .cline/rules/*.md for non-root rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TS',
          targets: [],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((x) => x.path === '.cline/rules/ts.md');
    expect(tsRule).toBeDefined();
  });

  it('generates .clineignore for ignore patterns', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      ignore: ['dist'],
    });
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const i = results.find((x) => x.path === EXPECTED_PATHS.ignore);
    expect(i).toBeDefined();
  });

  it('generates .cline/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'debug', description: 'Debug', body: 'Debug steps.' }],
    });
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const s = results.find((x) => x.path === '.cline/skills/debug/SKILL.md');
    expect(s).toBeDefined();
    expect(s!.content).toContain('Debug steps.');
  });

  it('generates .cline/mcp.json for MCP', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} },
        },
      },
    });
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules', 'mcp'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const m = results.find((x) => x.path === EXPECTED_PATHS.mcp);
    expect(m).toBeDefined();
  });

  it('generates .clinerules/workflows/*.md from commands (research: workflows)', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'deploy', description: 'Deploy workflow', body: 'Run deploy steps.' }],
    });
    const results = await generate({
      config: config({ targets: ['cline'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const w = results.find((x) => x.path === '.clinerules/workflows/deploy.md');
    expect(w).toBeDefined();
    expect(w!.content).toContain('Run deploy steps.');
  });
});

describe('agents-folder-structure-research: Codex CLI (docs §6)', () => {
  // Research: AGENTS.md is the primary and only instructions file per official Codex docs
  const EXPECTED_PATHS = {
    agentsMd: 'AGENTS.md',
  };

  it('generates AGENTS.md for Codex when root rule exists (research doc §6)', async () => {
    const results = await generate({
      config: config({ targets: ['codex-cli'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Codex Project Rules'),
      projectRoot: TEST_DIR,
    });
    const agents = results.find((x) => x.path === EXPECTED_PATHS.agentsMd);
    expect(agents).toBeDefined();
    expect(agents!.content).toContain('Codex Project Rules');
  });

  it('generates only AGENTS.md (no codex.md) per official docs', async () => {
    const results = await generate({
      config: config({ targets: ['codex-cli'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Shared rules for Codex and GitHub Agents'),
      projectRoot: TEST_DIR,
    });
    const agents = results.find((x) => x.path === EXPECTED_PATHS.agentsMd);
    expect(agents).toBeDefined();
    expect(results.find((x) => x.path === 'codex.md')).toBeUndefined();
  });

  it('generates nothing when no root rule (Codex returns [] without root)', async () => {
    // No root rule at all — only non-root rules
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'TS only',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const results = await generate({
      config: config({ targets: ['codex-cli'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.filter((x) => x.path === 'AGENTS.md')).toHaveLength(0);
  });

  it('skips Codex when rules feature disabled', async () => {
    const results = await generate({
      config: config({ targets: ['codex-cli'], features: ['commands'] }),
      canonical: canonicalWithRoot('# Root'),
      projectRoot: TEST_DIR,
    });
    expect(results).toHaveLength(0);
  });
});

describe('agents-folder-structure-research: Kiro (docs §8)', () => {
  const EXPECTED_PATHS = {
    agentsMd: 'AGENTS.md',
    steeringDir: '.kiro/steering/',
    skillsDir: '.kiro/skills/',
    hooksDir: '.kiro/hooks/',
    mcp: '.kiro/settings/mcp.json',
    ignore: '.kiroignore',
  };

  it('generates AGENTS.md from the root rule', async () => {
    const results = await generate({
      config: config({ targets: ['kiro'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Kiro Root'),
      projectRoot: TEST_DIR,
    });
    const root = results.find((x) => x.path === EXPECTED_PATHS.agentsMd);
    expect(root).toBeDefined();
    expect(root!.content).toContain('Kiro Root');
  });

  it('generates .kiro/steering/*.md for non-root rules with steering frontmatter', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          body: 'Use strict TypeScript.',
          globs: ['src/**/*.ts'],
          targets: [],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['kiro'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const rule = results.find((x) => x.path === '.kiro/steering/typescript.md');
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('inclusion: fileMatch');
    expect(rule!.content).toContain('fileMatchPattern: src/**/*.ts');
  });

  it('generates .kiro/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'debugging', description: 'Debug issues', body: 'Review logs first.' }],
    });
    const results = await generate({
      config: config({ targets: ['kiro'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const skill = results.find((x) => x.path === '.kiro/skills/debugging/SKILL.md');
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('Review logs first.');
  });

  it('generates .kiro/hooks/*.json from canonical hooks', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      hooks: {
        UserPromptSubmit: [{ matcher: '*', prompt: 'Capture intent.', type: 'prompt' }],
      },
    });
    const results = await generate({
      config: config({ targets: ['kiro'], features: ['rules', 'hooks'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const hook = results.find((x) => x.path === '.kiro/hooks/user-prompt-submit-1.json');
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('"trigger": "UserPromptSubmit"');
    expect(hook!.content).toContain('Capture intent.');
  });

  it('generates .kiro/settings/mcp.json and .kiroignore', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} },
        },
      },
      ignore: ['dist', '.env'],
    });
    const results = await generate({
      config: config({ targets: ['kiro'], features: ['rules', 'mcp', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const mcp = results.find((x) => x.path === EXPECTED_PATHS.mcp);
    const ignore = results.find((x) => x.path === EXPECTED_PATHS.ignore);
    expect(mcp).toBeDefined();
    expect(ignore).toBeDefined();
    expect(ignore!.content).toContain('dist');
  });
});

describe('agents-folder-structure-research: Windsurf (docs §7)', () => {
  const EXPECTED_PATHS = {
    agentsMd: 'AGENTS.md', // research: AGENTS.md (documented root instructions file)
    rulesDir: '.windsurf/rules/', // research: .windsurf/rules/*.md
    workflowsDir: '.windsurf/workflows/', // research: .windsurf/workflows/*.md
    skillsDir: '.windsurf/skills/', // research: .windsurf/skills/
    hooks: '.windsurf/hooks.json',
    mcp: '.windsurf/mcp_config.example.json',
    ignore: '.codeiumignore',
  };

  it('generates AGENTS.md from root rule', async () => {
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Windsurf Rules'),
      projectRoot: TEST_DIR,
    });
    const agents = results.find((x) => x.path === EXPECTED_PATHS.agentsMd);
    expect(agents).toBeDefined();
    expect(agents!.content).toContain('Windsurf Rules');
  });

  it('generates .windsurf/rules/*.md for non-root rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TS rules',
          targets: [],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((x) => x.path === '.windsurf/rules/ts.md');
    expect(tsRule).toBeDefined();
  });

  it('generates .windsurf/workflows/*.md from commands', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'deploy', description: 'Deploy', body: 'Deploy steps.' }],
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const wf = results.find((x) => x.path === '.windsurf/workflows/deploy.md');
    expect(wf).toBeDefined();
  });

  it('generates .windsurf/skills/{name}/SKILL.md for skills', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'review', description: 'Review', body: 'Review code.' }],
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const skill = results.find((x) => x.path === '.windsurf/skills/review/SKILL.md');
    expect(skill).toBeDefined();
  });

  it('generates .codeiumignore for ignore patterns', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      ignore: ['node_modules'],
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules', 'ignore'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const codeiumIgnore = results.find((x) => x.path === EXPECTED_PATHS.ignore);
    expect(codeiumIgnore).toBeDefined();
  });

  it('generates .windsurf/hooks.json from canonical hooks', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      hooks: {
        PreToolUse: [{ matcher: '*', command: 'echo pre' }],
      },
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules', 'hooks'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const hooks = results.find((x) => x.path === EXPECTED_PATHS.hooks);
    expect(hooks).toBeDefined();
  });

  it('generates .windsurf/mcp_config.example.json from canonical mcp', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
        },
      },
    });
    const results = await generate({
      config: config({ targets: ['windsurf'], features: ['rules', 'mcp'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const mcp = results.find((x) => x.path === EXPECTED_PATHS.mcp);
    expect(mcp).toBeDefined();
  });
});

/**
 * Research doc gaps (paths we don't generate — documented for future work):
 *
 * Claude:  .claude/settings.local.json (user-specific)
 * Cursor:  .cursorrules (legacy — we use .cursor/rules/), .cursor/sandbox.json and .cursor/environment.json (no canonical schema yet)
 * Copilot: .github/copilot/pull_request_review.json
 * Gemini:  .gemini/.env, .gemini/system.md, .gemini/sandbox-* (skills now supported)
 * Cline:   legacy flat-file `.clinerules` (IDE-era) — we use CLI-documented .cline/rules/*.md
 * Codex:   nested `AGENTS.md` / `AGENTS.override.md` for advisory rules; `.rules` only for `codex_emit: execution` (§11 in codex-cli-project-level-advanced.md)
 * Kiro: no repo-native commands or agents directory for IDE-first support
 * Windsurf: .windsurfrules/.windsurfignore (legacy), subdirectory AGENTS.md
 */

describe('agents-folder-structure-research: Antigravity (docs §8)', () => {
  const EXPECTED_PATHS = {
    rootRule: '.agents/rules/general.md', // generated main instructions; canonical stays rules/_root.md
    rulesDir: '.agents/rules/', // research: .agents/rules/*.md
    workflowsDir: '.agents/workflows/', // research: .agents/workflows/*.md (experimental path)
    skillsDir: '.agents/skills/', // research: .agents/skills/<name>/SKILL.md
  };
  // Gaps: no agents folder, no MCP file, no hooks, no ignore (only .gitignore per docs)

  it('generates .agents/rules/general.md from root rule (required trigger frontmatter)', async () => {
    const results = await generate({
      config: config({ targets: ['antigravity'], features: ['rules'] }),
      canonical: canonicalWithRoot('# Antigravity Root'),
      projectRoot: TEST_DIR,
    });
    const root = results.find((x) => x.path === EXPECTED_PATHS.rootRule);
    expect(root).toBeDefined();
    expect(root!.content).toContain('Antigravity Root');
    expect(root!.content).not.toContain('root: true');
    expect(root!.content).toContain('trigger: always_on');
  });

  it('generates .agents/rules/*.md for non-root rules', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      nonRootRules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          body: 'TS rules',
          targets: [],
        },
      ],
    });
    const results = await generate({
      config: config({ targets: ['antigravity'], features: ['rules'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((x) => x.path === '.agents/rules/ts.md');
    expect(tsRule).toBeDefined();
  });

  it('generates .agents/workflows/*.md from commands', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      commands: [{ name: 'review', description: 'Review', body: 'Review steps.' }],
    });
    const results = await generate({
      config: config({ targets: ['antigravity'], features: ['rules', 'commands'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const workflow = results.find((x) => x.path === '.agents/workflows/review.md');
    expect(workflow).toBeDefined();
    expect(workflow!.content).toContain('Review steps.');
    expect(workflow!.content).not.toContain('allowed-tools:');
    expect(workflow!.content).not.toContain('x-agentsmesh');
  });

  it('generates .agents/skills/*/SKILL.md with YAML frontmatter', async () => {
    const canonical = fullCanonical({
      rootBody: '# Root',
      skills: [{ name: 'typescript-pro', description: 'TypeScript skill', body: 'Use TS.' }],
    });
    const results = await generate({
      config: config({ targets: ['antigravity'], features: ['rules', 'skills'] }),
      canonical,
      projectRoot: TEST_DIR,
    });
    const skill = results.find(
      (x) => x.path === `${EXPECTED_PATHS.skillsDir}typescript-pro/SKILL.md`,
    );
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: typescript-pro');
    expect(skill!.content).toContain('TypeScript skill');
  });
});

describe('agents-folder-structure-research: cross-tool matrix (docs quick matrix)', () => {
  it('each agent produces its primary project instruction file when rules enabled', async () => {
    const canonical = canonicalWithRoot('# Cross-tool root rule');
    const targets = [
      'claude-code',
      'cursor',
      'copilot',
      'kiro',
      'gemini-cli',
      'cline',
      'codex-cli',
      'windsurf',
      'antigravity',
    ] as const;
    const primaryPaths: Record<(typeof targets)[number], string> = {
      'claude-code': 'CLAUDE.md',
      cursor: '.cursor/rules/general.mdc',
      copilot: '.github/copilot-instructions.md',
      kiro: 'AGENTS.md',
      'gemini-cli': 'GEMINI.md',
      cline: 'AGENTS.md',
      'codex-cli': 'AGENTS.md',
      windsurf: 'AGENTS.md',
      antigravity: '.agents/rules/general.md',
    };
    for (const target of targets) {
      const results = await generate({
        config: config({ targets: [target], features: ['rules'] }),
        canonical,
        projectRoot: TEST_DIR,
      });
      const path = primaryPaths[target];
      const found = results.find((r) => r.path === path);
      expect(found, `${target} should produce ${path}`).toBeDefined();
    }
  });
});
