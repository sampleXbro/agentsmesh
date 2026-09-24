/**
 * Windsurf generator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRules,
  generateIgnore,
  generateAgents,
  generateCommands,
  generateSkills,
  generateMcp,
  generateHooks,
} from '../../../../src/targets/windsurf/generator.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  WINDSURF_RULES_DIR,
  CODEIUM_IGNORE,
  WINDSURF_WORKFLOWS_DIR,
  WINDSURF_SKILLS_DIR,
  WINDSURF_MCP_EXAMPLE_FILE,
  WINDSURF_HOOKS_FILE,
} from '../../../../src/targets/windsurf/constants.js';

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

describe('generateRules (windsurf)', () => {
  it('generates .windsurfrules from root rule (flat, no frontmatter)', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: 'Project rules',
          globs: [],
          body: '# Rules\n- Use TypeScript\n',
        },
      ],
    });
    const results = generateRules(canonical);
    const root = results.find((r) => r.path === 'AGENTS.md');
    expect(root).toBeDefined();
    expect(root?.content).toBe('# Rules\n- Use TypeScript');
    expect(root?.content).not.toContain('---');
    expect(root?.content).not.toContain('description:');
  });

  it('generates .windsurf/rules/*.md for non-root rules with frontmatter', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TS.',
        },
      ],
    });
    const results = generateRules(canonical);
    const perRule = results.find((r) => r.path === `${WINDSURF_RULES_DIR}/typescript.md`);
    expect(perRule).toBeDefined();
    expect(perRule?.content).toContain('description: TS rules');
    expect(perRule?.content).toContain('trigger: glob');
    expect(perRule?.content).toContain('\nglobs: src/**/*.ts\n');
    expect(perRule?.content).not.toContain('\nglob:');
    expect(perRule?.content).toContain('Use strict TS.');
  });

  it('non-root rule with empty description and globs uses body only', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/proj/.agentsmesh/rules/minimal.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Body only',
        },
      ],
    });
    const results = generateRules(canonical);
    const minimal = results.find((r) => r.path === `${WINDSURF_RULES_DIR}/minimal.md`);
    expect(minimal?.content).toBe('Body only');
  });

  it('skips non-root rules when targets excludes windsurf', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/proj/.agentsmesh/rules/cursor-only.md',
          root: false,
          targets: ['cursor'],
          description: '',
          globs: [],
          body: 'Cursor only',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results.map((r) => r.path)).toEqual(['AGENTS.md']);
  });

  it('returns empty when no root rule', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/other.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Other rule',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toEqual([]);
  });

  it('non-root rule with no description or globs uses body only', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/p/.agentsmesh/rules/bare.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Bare rule body',
        },
      ],
    });
    const results = generateRules(canonical);
    const bare = results.find((r) => r.path === `${WINDSURF_RULES_DIR}/bare.md`);
    expect(bare?.content).toBe('Bare rule body');
    expect(bare?.content).not.toContain('---');
  });

  it('trims root rule body', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '  Content  \n',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results[0]?.path).toBe('AGENTS.md');
    expect(results[0]?.content).toBe('Content');
  });
});

describe('generateRules (windsurf) — AGENTS.md + trigger', () => {
  it('generates AGENTS.md from root rule body (flat, no frontmatter)', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root Rules\n- Use TypeScript\n',
        },
      ],
    });
    const results = generateRules(canonical);
    const agentsMd = results.find((r) => r.path === 'AGENTS.md');
    expect(agentsMd).toBeDefined();
    expect(agentsMd?.content).toContain('# Root Rules');
    expect(agentsMd?.content).not.toContain('---');
  });

  it('includes trigger field in .windsurf/rules/*.md frontmatter when set', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/proj/.agentsmesh/rules/ai.md',
          root: false,
          targets: [],
          description: 'AI rule',
          globs: [],
          body: 'AI body.',
          trigger: 'model_decision' as const,
        },
      ],
    });
    const results = generateRules(canonical);
    const aiRule = results.find((r) => r.path === '.windsurf/rules/ai.md');
    expect(aiRule).toBeDefined();
    expect(aiRule?.content).toContain('trigger: model_decision');
  });

  it('includes trigger: manual in frontmatter', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/p/.agentsmesh/rules/manual.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Manual.',
          trigger: 'manual' as const,
        },
      ],
    });
    const results = generateRules(canonical);
    const manualRule = results.find((r) => r.path === '.windsurf/rules/manual.md');
    expect(manualRule?.content).toContain('trigger: manual');
  });

  it('defaults to trigger: glob when globs exist and trigger is not set', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/p/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: '/p/.agentsmesh/rules/no-trigger.md',
          root: false,
          targets: [],
          description: 'No trigger',
          globs: ['**/*.ts'],
          body: 'No trigger body.',
        },
      ],
    });
    const results = generateRules(canonical);
    const rule = results.find((r) => r.path === '.windsurf/rules/no-trigger.md');
    expect(rule?.content).toContain('trigger: glob');
    expect(rule?.content).toContain('\nglobs: "**/*.ts"\n');
  });
});

describe('generateAgents (windsurf)', () => {
  it('projects agents into reserved Windsurf skills with metadata', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/reviewer.md',
          name: 'reviewer',
          description: 'Review specialist',
          tools: ['Read', 'Grep'],
          disallowedTools: ['Bash(rm -rf *)'],
          model: 'sonnet',
          permissionMode: 'ask',
          maxTurns: 9,
          mcpServers: ['context7'],
          hooks: {},
          skills: ['post-feature-qa'],
          memory: 'notes/reviewer.md',
          body: 'Review risky changes first.',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(`${WINDSURF_SKILLS_DIR}/am-agent-reviewer/SKILL.md`);
    expect(results[0]?.content).toContain('x-agentsmesh-kind: agent');
    expect(results[0]?.content).toContain('x-agentsmesh-name: reviewer');
    expect(results[0]?.content).toContain('Review risky changes first.');
  });
});

describe('generateIgnore (windsurf)', () => {
  it('generates .codeiumignore from canonical ignore patterns', () => {
    const canonical = makeCanonical({
      ignore: ['node_modules/', 'dist/', '.env'],
    });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(1);
    const codeiumIgnore = results.find((r) => r.path === CODEIUM_IGNORE);
    expect(codeiumIgnore?.content).toBe('node_modules/\ndist/\n.env');
  });

  it('returns empty when no ignore patterns', () => {
    expect(generateIgnore(makeCanonical())).toEqual([]);
    expect(generateIgnore(makeCanonical({ ignore: [] }))).toEqual([]);
  });
});

describe('generateCommands (windsurf)', () => {
  it('generates markdown .windsurf/workflows/{name}.md with description intro + body', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/p/.agentsmesh/commands/deploy.md',
          name: 'deploy',
          description: 'Deploy the app',
          allowedTools: [],
          body: 'Run the deploy process.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(`${WINDSURF_WORKFLOWS_DIR}/deploy.md`);
    expect(results[0]?.content).toContain('Deploy the app');
    expect(results[0]?.content).toContain('Run the deploy process.');
  });

  it('returns empty array when no commands', () => {
    expect(generateCommands(makeCanonical())).toEqual([]);
  });
});

describe('generateSkills (windsurf)', () => {
  it('generates .windsurf/skills/{name}/SKILL.md from canonical skills', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/p/.agentsmesh/skills/api-gen/SKILL.md',
          name: 'api-gen',
          description: 'API generation',
          body: 'When creating APIs, follow patterns.',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(`${WINDSURF_SKILLS_DIR}/api-gen/SKILL.md`);
    expect(results[0]?.content).toContain('name: api-gen');
    expect(results[0]?.content).toContain('description: API generation');
    expect(results[0]?.content).toContain('When creating APIs');
  });

  it('generates supporting files alongside SKILL.md', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/p/.agentsmesh/skills/tdd/SKILL.md',
          name: 'tdd',
          description: 'TDD skill',
          body: 'Follow TDD.',
          supportingFiles: [
            {
              relativePath: 'example.ts',
              absolutePath: '/p/.agentsmesh/skills/tdd/example.ts',
              content: 'const x = 1;',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results.some((r) => r.path === `${WINDSURF_SKILLS_DIR}/tdd/SKILL.md`)).toBe(true);
    expect(results.some((r) => r.path === `${WINDSURF_SKILLS_DIR}/tdd/example.ts`)).toBe(true);
    const support = results.find((r) => r.path === `${WINDSURF_SKILLS_DIR}/tdd/example.ts`);
    expect(support?.content).toBe('const x = 1;');
  });

  it('returns empty array when no skills', () => {
    expect(generateSkills(makeCanonical())).toEqual([]);
  });
});

describe('generateMcp (windsurf)', () => {
  it('generates .windsurf/mcp_config.example.json from canonical mcp servers', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          context7: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: { NODE_ENV: 'test' },
          },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(WINDSURF_MCP_EXAMPLE_FILE);
    expect(results[0]?.content).toContain('"mcpServers"');
    expect(results[0]?.content).toContain('"context7"');
  });

  it('returns empty when no mcp servers are present', () => {
    expect(generateMcp(makeCanonical())).toEqual([]);
  });
});

describe('generateHooks (windsurf)', () => {
  it('generates .windsurf/hooks.json from canonical hooks', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: '*', command: 'echo pre', timeout: 10 }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(WINDSURF_HOOKS_FILE);
    expect(results[0]?.content).toContain('"hooks"');
    expect(results[0]?.content).toContain('"pre_tool_use"');
    expect(results[0]?.content).toContain('"command": "echo pre"');
    expect(results[0]?.content).toContain('"show_output": true');
  });

  it('returns empty when hooks are absent or empty', () => {
    expect(generateHooks(makeCanonical())).toEqual([]);
    expect(generateHooks(makeCanonical({ hooks: {} }))).toEqual([]);
  });
});
