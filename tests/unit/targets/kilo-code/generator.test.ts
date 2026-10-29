import { describe, it, expect } from 'vitest';
import { parse as yamlParse } from 'yaml';
import type { CanonicalFiles, CanonicalAgent } from '../../../../src/core/types.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateMcp,
  generateIgnore,
  generateSkills,
  generatePermissions,
} from '../../../../src/targets/kilo-code/generator.js';
import {
  KILO_CODE_ROOT_RULE,
  KILO_CODE_RULES_DIR,
  KILO_CODE_COMMANDS_DIR,
  KILO_CODE_AGENTS_DIR,
  KILO_CODE_SKILLS_DIR,
  KILO_CODE_IGNORE,
  KILO_CONFIG_FILE,
} from '../../../../src/targets/kilo-code/constants.js';

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

function makeAgent(overrides: Partial<CanonicalAgent> = {}): CanonicalAgent {
  return {
    source: '/proj/.agentsmesh/agents/my-agent.md',
    name: 'My Agent',
    description: '',
    tools: [],
    disallowedTools: [],
    model: '',
    permissionMode: '',
    maxTurns: 0,
    mcpServers: [],
    hooks: {},
    skills: [],
    memory: '',
    body: '',
    ...overrides,
  };
}

describe('generateRules (kilo-code)', () => {
  it('generates root rule as AGENTS.md', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root\n\nUse TDD.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(KILO_CODE_ROOT_RULE);
    expect(results[0].content).toContain('Use TDD.');
  });

  it('generates non-root rules under .kilo/rules/{slug}.md', () => {
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
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Use strict TypeScript.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(3);
    const tsRule = results.find((r) => r.path === `${KILO_CODE_RULES_DIR}/typescript.md`);
    expect(tsRule).toBeDefined();
    expect(tsRule?.content).toContain('Use strict TypeScript.');
  });

  it('writes description and globs as frontmatter when present', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TypeScript standards',
          globs: ['src/**/*.ts'],
          body: 'Strict mode mandatory.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    expect(results[0].content).toContain('description: TypeScript standards');
    expect(results[0].content).toContain('globs:');
    expect(results[0].content).toContain('src/**/*.ts');
  });

  it('omits frontmatter block entirely when no description/globs', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/inline.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'Plain rule body.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    expect(results[0].content.startsWith('---')).toBe(false);
    expect(results[0].content).toBe('Plain rule body.');
  });

  it('skips rules filtered to other targets', () => {
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
          source: '/proj/.agentsmesh/rules/claude-only.md',
          root: false,
          targets: ['claude-code'],
          description: '',
          globs: [],
          body: 'Claude only.',
        },
        {
          source: '/proj/.agentsmesh/rules/kilo-only.md',
          root: false,
          targets: ['kilo-code'],
          description: '',
          globs: [],
          body: 'Kilo only.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.path).sort()).toEqual(
      [KILO_CODE_ROOT_RULE, `${KILO_CODE_RULES_DIR}/kilo-only.md`, KILO_CONFIG_FILE].sort(),
    );
  });

  it('returns empty array when no rules', () => {
    expect(generateRules(makeCanonical())).toEqual([]);
  });
});

describe('generateCommands (kilo-code)', () => {
  it('generates command files in .kilo/commands/', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/review.md',
          name: 'review',
          description: 'Review the code',
          allowedTools: ['Read', 'Grep'],
          body: 'Review all changed files.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${KILO_CODE_COMMANDS_DIR}/review.md`);
    expect(results[0].content).toContain('description: Review the code');
    expect(results[0].content).toContain('Review all changed files.');
  });

  it('omits description frontmatter when empty', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/commit.md',
          name: 'commit',
          description: '',
          allowedTools: [],
          body: 'Commit changes.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results[0].content).not.toContain('description:');
    expect(results[0].content).toContain('Commit changes.');
  });

  it('does not project allowed-tools (kilo commands carry only description)', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/test.md',
          name: 'test',
          description: 'Run tests',
          allowedTools: ['Bash(pnpm test)', 'Bash(pnpm typecheck)'],
          body: 'Run all tests.',
        },
      ],
    });
    const results = generateCommands(canonical);
    expect(results[0].content).not.toContain('allowed-tools');
    expect(results[0].content).not.toContain('allowedTools');
    expect(results[0].content).not.toContain('Bash(pnpm test)');
  });

  it('returns empty array when no commands', () => {
    expect(generateCommands(makeCanonical())).toEqual([]);
  });
});

describe('generateAgents (kilo-code)', () => {
  it('generates first-class agent files in .kilo/agents/{slug}.md', () => {
    const canonical = makeCanonical({
      agents: [
        makeAgent({
          source: '/proj/.agentsmesh/agents/code-reviewer.md',
          name: 'Code Reviewer',
          description: 'Reviews code for quality',
          body: 'You are an expert code reviewer.',
        }),
      ],
    });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${KILO_CODE_AGENTS_DIR}/code-reviewer.md`);
    const parsed = yamlParse(
      results[0].content.split('\n---', 2)[0].replace(/^---\n?/, ''),
    ) as Record<string, unknown>;
    expect(parsed.mode).toBe('subagent');
    expect(parsed.description).toBe('Reviews code for quality');
    expect(results[0].content).toContain('You are an expert code reviewer.');
  });

  it('writes mode: subagent always', () => {
    const canonical = makeCanonical({
      agents: [makeAgent({ name: 'helper', source: '/proj/.agentsmesh/agents/helper.md' })],
    });
    const results = generateAgents(canonical);
    expect(results[0].content).toContain('mode: subagent');
  });

  it('writes model when present', () => {
    const canonical = makeCanonical({
      agents: [
        makeAgent({
          source: '/proj/.agentsmesh/agents/researcher.md',
          model: 'anthropic/claude-haiku-4-5',
          description: 'Research things',
          body: 'Research.',
        }),
      ],
    });
    const results = generateAgents(canonical);
    expect(results[0].content).toContain('model: anthropic/claude-haiku-4-5');
  });

  it('omits model when empty', () => {
    const canonical = makeCanonical({
      agents: [
        makeAgent({
          source: '/proj/.agentsmesh/agents/helper.md',
          description: 'Help',
          body: 'Help.',
        }),
      ],
    });
    expect(generateAgents(canonical)[0].content).not.toContain('model:');
  });

  it('writes tools and disallowedTools when present', () => {
    const canonical = makeCanonical({
      agents: [
        makeAgent({
          source: '/proj/.agentsmesh/agents/locked.md',
          tools: ['Read', 'Grep'],
          disallowedTools: ['Bash'],
          body: 'Restricted agent.',
        }),
      ],
    });
    const content = generateAgents(canonical)[0].content;
    expect(content).toContain('tools:');
    expect(content).toContain('Read');
    expect(content).toContain('Grep');
    expect(content).toContain('disallowedTools:');
    expect(content).toContain('Bash');
  });

  it('produces slug from source basename without extension', () => {
    const canonical = makeCanonical({
      agents: [
        makeAgent({ source: '/proj/.agentsmesh/agents/test-writer.md', name: 'Test Writer' }),
      ],
    });
    const results = generateAgents(canonical);
    expect(results[0].path).toBe(`${KILO_CODE_AGENTS_DIR}/test-writer.md`);
  });

  it('returns empty array when no agents', () => {
    expect(generateAgents(makeCanonical())).toEqual([]);
  });
});

describe('generateMcp (kilo-code)', () => {
  it('generates kilo.jsonc with native mcp server mapping', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          'my-server': { type: 'stdio', command: 'node', args: ['server.js'], env: {} },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(KILO_CONFIG_FILE);
    const parsed = JSON.parse(results[0].content) as { mcp: Record<string, unknown> };
    expect(parsed.mcp['my-server']).toEqual({ type: 'local', command: ['node', 'server.js'] });
  });

  it('returns empty array when mcp is null', () => {
    expect(generateMcp(makeCanonical())).toEqual([]);
  });

  it('returns empty array when mcpServers is empty', () => {
    expect(generateMcp(makeCanonical({ mcp: { mcpServers: {} } }))).toEqual([]);
  });
});

describe('generateIgnore (kilo-code)', () => {
  it('generates .kilocodeignore (legacy filename, only natively-loaded ignore)', () => {
    const canonical = makeCanonical({ ignore: ['.env', 'node_modules/'] });
    const results = generateIgnore(canonical);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(KILO_CODE_IGNORE);
    expect(results[0].path).toBe('.kilocodeignore');
    expect(results[0].content).toBe('.env\nnode_modules/');
  });

  it('returns empty array when no ignore patterns', () => {
    expect(generateIgnore(makeCanonical())).toEqual([]);
  });
});

describe('generatePermissions (kilo-code)', () => {
  it('returns [] when permissions is null', () => {
    expect(generatePermissions(makeCanonical())).toEqual([]);
  });

  it('returns [] when all permission arrays are empty', () => {
    expect(
      generatePermissions(makeCanonical({ permissions: { allow: [], deny: [], ask: [] } })),
    ).toEqual([]);
  });

  it('emits kilo.jsonc with permission key', () => {
    const result = generatePermissions(
      makeCanonical({
        permissions: { allow: ['Read', 'Write'], deny: ['Bash'], ask: ['Edit'] },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(KILO_CONFIG_FILE);
    const parsed = JSON.parse(result[0].content) as { permission: Record<string, string> };
    expect(parsed.permission).toEqual({ Read: 'allow', Write: 'allow', Bash: 'deny', Edit: 'ask' });
  });

  it('emits kilo.jsonc when only allow is populated', () => {
    const result = generatePermissions(
      makeCanonical({ permissions: { allow: ['Read'], deny: [], ask: [] } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(KILO_CONFIG_FILE);
    const parsed = JSON.parse(result[0].content) as { permission: Record<string, string> };
    expect(parsed.permission).toEqual({ Read: 'allow' });
  });

  it('emits kilo.jsonc when only deny is populated', () => {
    const result = generatePermissions(
      makeCanonical({ permissions: { allow: [], deny: ['Bash'], ask: [] } }),
    );
    expect(result).toHaveLength(1);
    const parsed = JSON.parse(result[0].content) as { permission: Record<string, string> };
    expect(parsed.permission).toEqual({ Bash: 'deny' });
  });

  it('emits kilo.jsonc when only ask is populated', () => {
    const result = generatePermissions(
      makeCanonical({ permissions: { allow: [], deny: [], ask: ['Bash'] } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(KILO_CONFIG_FILE);
    const parsed = JSON.parse(result[0].content) as { permission: Record<string, string> };
    expect(parsed.permission).toEqual({ Bash: 'ask' });
  });
});

describe('generateSkills (kilo-code)', () => {
  it('writes SKILL.md to .kilo/skills/{name}/SKILL.md', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/api-generator/SKILL.md',
          name: 'api-generator',
          description: 'Generate REST endpoints',
          body: '# API Generator\n\nUse this skill...',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    const main = results.find((r) => r.path === `${KILO_CODE_SKILLS_DIR}/api-generator/SKILL.md`);
    expect(main).toBeDefined();
    expect(main?.content).toContain('name: api-generator');
    expect(main?.content).toContain('description: Generate REST endpoints');
  });

  it('writes supporting files alongside SKILL.md', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/api-generator/SKILL.md',
          name: 'api-generator',
          description: 'Generate REST endpoints',
          body: '# API Generator',
          supportingFiles: [
            {
              relativePath: 'references/route-checklist.md',
              absolutePath: '/proj/.agentsmesh/skills/api-generator/references/route-checklist.md',
              content: '# Route Checklist',
            },
            {
              relativePath: 'template.ts',
              absolutePath: '/proj/.agentsmesh/skills/api-generator/template.ts',
              content: 'export const template = 1;',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual([
      `${KILO_CODE_SKILLS_DIR}/api-generator/SKILL.md`,
      `${KILO_CODE_SKILLS_DIR}/api-generator/references/route-checklist.md`,
      `${KILO_CODE_SKILLS_DIR}/api-generator/template.ts`,
    ]);
  });

  it('returns empty array when no skills', () => {
    expect(generateSkills(makeCanonical())).toEqual([]);
  });
});
