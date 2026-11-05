import { describe, it, expect } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { parseFrontmatter } from '../../../../src/utils/text/markdown.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generateHooks,
  generatePermissions,
} from '../../../../src/targets/qwen-code/generator.js';
import {
  QWEN_ROOT,
  QWEN_RULES_DIR,
  QWEN_COMMANDS_DIR,
  QWEN_AGENTS_DIR,
  QWEN_SKILLS_DIR,
  QWEN_SETTINGS,
  QWEN_IGNORE,
} from '../../../../src/targets/qwen-code/constants.js';

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

describe('generateRules (qwen-code)', () => {
  it('generates QWEN.md from root rule', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root\n\nUse TDD and strict TypeScript.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_ROOT);
    expect(results[0].content).toContain('Use TDD and strict TypeScript.');
    expect(results[0].content).not.toMatch(/^---/);
  });

  it('generates non-root rule to .qwen/rules/<slug>.md', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TypeScript standards',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_RULES_DIR}/typescript.md`);
    const parsedRule = parseFrontmatter(results[0].content);
    expect(parsedRule.frontmatter.description).toBe('TypeScript standards');
    // Qwen Code's rulesDiscovery.ts parseRuleFile() only recognizes `paths:`
    // for path-conditional rule injection — never `globs`.
    expect(parsedRule.frontmatter.paths).toEqual(['src/**/*.ts']);
    expect(parsedRule.frontmatter.globs).toBeUndefined();
    expect(parsedRule.body).toContain('Use strict mode.');
  });

  it('generates both QWEN.md (root) and .qwen/rules/<slug>.md (non-root)', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root',
        },
        {
          source: '/proj/.agentsmesh/rules/security.md',
          root: false,
          targets: [],
          description: 'Security rules',
          globs: [],
          body: 'No hardcoded secrets.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(2);
    expect(results[0].path).toBe(QWEN_ROOT);
    expect(results[1].path).toBe(`${QWEN_RULES_DIR}/security.md`);
  });

  it('filters out rules targeted to other tools', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root',
        },
        {
          source: '/proj/.agentsmesh/rules/cursor-only.md',
          root: false,
          targets: ['cursor'],
          description: 'Cursor-specific',
          globs: [],
          body: 'Cursor only.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_ROOT);
    expect(results[0].content).not.toContain('Cursor only.');
  });

  it('returns empty when no rules exist', () => {
    const results = generateRules(makeCanonical({ rules: [] }));
    expect(results).toHaveLength(0);
  });

  it('generates QWEN.md with empty string for root rule with empty body', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_ROOT);
    expect(results[0].content).toBe('');
  });

  it('emits non-root rule with empty body as empty-body frontmatter doc', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/empty.md',
          root: false,
          targets: [],
          description: 'Empty rule',
          globs: [],
          body: '   \n  ',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_RULES_DIR}/empty.md`);
    const parsedRule = parseFrontmatter(results[0].content);
    expect(parsedRule.frontmatter.description).toBe('Empty rule');
    expect(parsedRule.body.trim()).toBe('');
  });

  it('includes rules explicitly targeting qwen-code', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/qwen-only.md',
          root: false,
          targets: ['qwen-code'],
          description: 'Qwen-only rule',
          globs: [],
          body: 'Qwen specific.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_RULES_DIR}/qwen-only.md`);
    expect(results[0].content).toContain('Qwen specific.');
  });
});

describe('generateCommands (qwen-code)', () => {
  it('generates .qwen/commands/<name>.md from canonical command', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'review',
          description: 'Review the current file for issues',
          allowedTools: ['Read', 'Bash'],
          body: 'Read the file and review it.',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_COMMANDS_DIR}/review.md`);
    const parsedCmd = parseFrontmatter(results[0].content);
    expect(parsedCmd.frontmatter.description).toBe('Review the current file for issues');
    // Qwen Code's MarkdownCommandDefSchema has no tool-restriction field —
    // allowed-tools is never projected, even when canonical data has it.
    expect(parsedCmd.frontmatter['allowed-tools']).toBeUndefined();
    expect(parsedCmd.body).toContain('Read the file and review it.');
  });

  it('generates multiple commands as separate files', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'review',
          description: 'Review code',
          allowedTools: [],
          body: 'Review.',
        },
        {
          name: 'refactor',
          description: 'Refactor code',
          allowedTools: [],
          body: 'Refactor.',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(2);
    expect(results[0].path).toBe(`${QWEN_COMMANDS_DIR}/review.md`);
    expect(results[1].path).toBe(`${QWEN_COMMANDS_DIR}/refactor.md`);
  });

  it('returns empty when no commands exist', () => {
    const results = generateCommands(makeCanonical({ commands: [] }));
    expect(results).toHaveLength(0);
  });

  it('omits allowed-tools from frontmatter when canonical allowedTools is empty', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'simple',
          description: 'A simple command',
          allowedTools: [],
          body: 'Do something.',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).not.toContain('allowed-tools');
    expect(results[0].content).toContain('A simple command');
  });

  it('generates command with empty body', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'empty-body',
          description: 'Command with no body',
          allowedTools: [],
          body: '',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_COMMANDS_DIR}/empty-body.md`);
  });
});

describe('generateAgents (qwen-code)', () => {
  it('generates .qwen/agents/<name>.md from canonical agent', () => {
    const canonical = makeCanonical({
      agents: [
        {
          name: 'researcher',
          description: 'Research agent',
          tools: ['WebSearch'],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'You are a researcher.',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_AGENTS_DIR}/researcher.md`);
    const parsedAgent = parseFrontmatter(results[0].content);
    expect(parsedAgent.frontmatter.name).toBe('researcher');
    expect(parsedAgent.frontmatter.description).toBe('Research agent');
    expect(parsedAgent.frontmatter.tools).toEqual(['WebSearch']);
    expect(parsedAgent.body).toContain('You are a researcher.');
  });

  it('returns empty when no agents exist', () => {
    const results = generateAgents(makeCanonical({ agents: [] }));
    expect(results).toHaveLength(0);
  });

  it('omits tools from frontmatter when empty', () => {
    const canonical = makeCanonical({
      agents: [
        {
          name: 'simple-agent',
          description: 'No tools agent',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'You are a simple agent.',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).not.toContain('tools:');
    expect(results[0].content).toContain('simple-agent');
  });

  it('generates agent with empty body', () => {
    const canonical = makeCanonical({
      agents: [
        {
          name: 'empty-agent',
          description: 'Agent with no body',
          tools: ['Read'],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: '',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_AGENTS_DIR}/empty-agent.md`);
  });
});

describe('generateSkills (qwen-code)', () => {
  it('generates .qwen/skills/<name>/SKILL.md and supporting files', () => {
    const canonical = makeCanonical({
      skills: [
        {
          name: 'api-generator',
          source: '/proj/.agentsmesh/skills/api-generator/SKILL.md',
          description: 'Generate REST API endpoints',
          body: '# API Generator\n\nUse this for REST endpoints.',
          supportingFiles: [
            {
              relativePath: 'references/checklist.md',
              content: '# API Checklist\n\n- Define routes',
            },
          ],
        },
      ],
    });

    const results = generateSkills(canonical);

    expect(results).toHaveLength(2);
    expect(results[0].path).toBe(`${QWEN_SKILLS_DIR}/api-generator/SKILL.md`);
    const parsedSkill = parseFrontmatter(results[0].content);
    expect(parsedSkill.frontmatter.name).toBe('api-generator');
    expect(parsedSkill.frontmatter.description).toBe('Generate REST API endpoints');
    expect(parsedSkill.body).toContain('Use this for REST endpoints.');
    expect(results[1].path).toBe(`${QWEN_SKILLS_DIR}/api-generator/references/checklist.md`);
    expect(results[1].content).toContain('API Checklist');
  });

  it('returns empty when no skills exist', () => {
    const results = generateSkills(makeCanonical({ skills: [] }));
    expect(results).toHaveLength(0);
  });

  it('omits description and emits empty body when skill has neither', () => {
    const canonical = makeCanonical({
      skills: [
        {
          name: 'bare',
          source: '/proj/.agentsmesh/skills/bare/SKILL.md',
          description: '',
          body: '   ',
          supportingFiles: [],
        },
      ],
    });

    const results = generateSkills(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${QWEN_SKILLS_DIR}/bare/SKILL.md`);
    const parsedSkill = parseFrontmatter(results[0].content);
    expect(parsedSkill.frontmatter.name).toBe('bare');
    expect(parsedSkill.frontmatter).not.toHaveProperty('description');
    expect(parsedSkill.body.trim()).toBe('');
  });
});

describe('generateMcp (qwen-code)', () => {
  it('generates .qwen/settings.json with mcpServers', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          context7: {
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
          },
        },
      },
    });

    const results = generateMcp(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_SETTINGS);
    const parsed = JSON.parse(results[0].content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('mcpServers');
    const servers = parsed['mcpServers'] as Record<string, unknown>;
    expect(Object.keys(servers)).toContain('context7');
  });

  it('returns empty when no MCP config exists', () => {
    const results = generateMcp(makeCanonical({ mcp: null }));
    expect(results).toHaveLength(0);
  });

  it('returns empty when mcpServers is empty', () => {
    const results = generateMcp(makeCanonical({ mcp: { mcpServers: {} } }));
    expect(results).toHaveLength(0);
  });
});

describe('generateIgnore (qwen-code)', () => {
  it('generates .qwenignore from canonical ignore patterns', () => {
    const canonical = makeCanonical({
      ignore: ['.env', 'node_modules/', 'dist/'],
    });

    const results = generateIgnore(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_IGNORE);
    expect(results[0].content).toContain('.env');
    expect(results[0].content).toContain('node_modules/');
    expect(results[0].content).toContain('dist/');
  });

  it('returns empty when no ignore patterns exist', () => {
    const results = generateIgnore(makeCanonical({ ignore: [] }));
    expect(results).toHaveLength(0);
  });
});

describe('generateHooks (qwen-code)', () => {
  it('returns empty when hooks is null', () => {
    const results = generateHooks(makeCanonical({ hooks: null }));
    expect(results).toHaveLength(0);
  });

  it('returns empty when hooks is an empty object', () => {
    const results = generateHooks(makeCanonical({ hooks: {} }));
    expect(results).toHaveLength(0);
  });

  it('emits settings.json with hooks key', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: 'echo pre', type: 'command' as const }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(QWEN_SETTINGS);
    const parsed = JSON.parse(results[0].content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('hooks');
    expect(parsed).not.toHaveProperty('mcpServers');
    expect(parsed).not.toHaveProperty('permissions');
  });

  it('returns empty when all hook events produce no valid entries', () => {
    // hooks present but all entries have no command/prompt text
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: '', type: 'command' as const }],
      },
    });
    const results = generateHooks(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generatePermissions (qwen-code)', () => {
  it('returns empty when permissions is null', () => {
    const results = generatePermissions(makeCanonical({ permissions: null }));
    expect(results).toHaveLength(0);
  });

  it('writes managed empty lists, so generate clears them', () => {
    expect(
      generatePermissions(makeCanonical({ permissions: { allow: [], deny: [], ask: [] } })),
    ).toEqual([
      {
        path: QWEN_SETTINGS,
        content: JSON.stringify({ permissions: { allow: [], deny: [], ask: [] } }, null, 2),
      },
    ]);
  });

  it('writes every managed list', () => {
    const canonical = makeCanonical({
      permissions: {
        allow: ['Bash(git diff)', 'Read'],
        deny: ['Bash(rm -rf)'],
        ask: ['WebSearch'],
      },
    });
    expect(generatePermissions(canonical)).toEqual([
      {
        path: QWEN_SETTINGS,
        content: JSON.stringify(
          {
            permissions: {
              allow: ['Bash(git diff)', 'Read'],
              deny: ['Bash(rm -rf)'],
              ask: ['WebSearch'],
            },
          },
          null,
          2,
        ),
      },
    ]);
  });

  it('leaves out unmanaged lists, so the merge keeps the user lists', () => {
    expect(generatePermissions(makeCanonical({ permissions: { allow: ['Read'] } }))).toEqual([
      {
        path: QWEN_SETTINGS,
        content: JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2),
      },
    ]);
  });

  it('does not emit mcpServers or hooks keys', () => {
    const canonical = makeCanonical({
      permissions: { allow: ['Read'], deny: [], ask: [] },
    });
    const results = generatePermissions(canonical);
    const parsed = JSON.parse(results[0].content) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('mcpServers');
    expect(parsed).not.toHaveProperty('hooks');
  });
});
