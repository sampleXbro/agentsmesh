import { describe, it, expect } from 'vitest';
import { parse as yamlParse } from 'yaml';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  generateRules,
  generateSkills,
  generateCommands,
  generateAgents,
  generateMcp,
} from '../../../../src/targets/rovodev/generator.js';
import {
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_COMMANDS_DIR,
  ROVODEV_PROMPTS_FILE,
  ROVODEV_GLOBAL_MCP_FILE,
} from '../../../../src/targets/rovodev/constants.js';

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

describe('generateRules (rovodev)', () => {
  it('generates AGENTS.md for the root rule', () => {
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
    expect(results[0].path).toBe(ROVODEV_ROOT_FILE);
    expect(results[0].content).toContain('Use TDD and strict TypeScript.');
    expect(results[0].content).not.toMatch(/^---\n/);
  });

  it('embeds non-root rules in AGENTS.md', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root instructions',
        },
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
    expect(results[0].path).toBe(ROVODEV_ROOT_FILE);
    expect(results[0].content).toContain('# Root instructions');
    expect(results[0].content).toContain('Use strict mode.');
  });

  it('filters rules targeted to other tools', () => {
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
          body: 'Only for Cursor.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).not.toContain('Only for Cursor.');
  });

  it('includes rules explicitly targeted to rovodev', () => {
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
          source: '/proj/.agentsmesh/rules/rovodev-only.md',
          root: false,
          targets: ['rovodev'],
          description: 'Rovo Dev-specific',
          globs: [],
          body: 'Only for Rovo Dev.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Only for Rovo Dev.');
  });

  it('returns empty when no rules exist', () => {
    const canonical = makeCanonical({ rules: [] });
    const results = generateRules(canonical);
    expect(results).toHaveLength(0);
  });

  it('generates from root body only when no non-root rules', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Root only',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(ROVODEV_ROOT_FILE);
    expect(results[0].content).toContain('# Root only');
  });
});

describe('generateSkills (rovodev)', () => {
  it('generates skills to .rovodev/skills/', () => {
    const canonical = makeCanonical({
      skills: [
        {
          name: 'debugging',
          source: '/proj/.agentsmesh/skills/debugging/SKILL.md',
          description: 'Debug workflow',
          body: '# Debugging\n\nReproduce first.',
          supportingFiles: [
            {
              relativePath: 'references/checklist.md',
              content: '# Checklist\n\n- Reproduce issue',
            },
          ],
        },
      ],
    });

    const results = generateSkills(canonical);

    expect(results.length).toBeGreaterThanOrEqual(2);
    const skillFile = results.find((r) => r.path === `${ROVODEV_SKILLS_DIR}/debugging/SKILL.md`);
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('name: debugging');
    expect(skillFile!.content).toContain('description: Debug workflow');
    const refFile = results.find(
      (r) => r.path === `${ROVODEV_SKILLS_DIR}/debugging/references/checklist.md`,
    );
    expect(refFile).toBeDefined();
    expect(refFile!.content).toContain('Reproduce issue');
  });

  it('returns empty when no skills exist', () => {
    const canonical = makeCanonical({ skills: [] });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateCommands (rovodev)', () => {
  it('generates a prompts.yml manifest entry plus a commands/<name>.md content file', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'review',
          source: '/proj/.agentsmesh/commands/review.md',
          description: 'Review code changes',
          body: 'Run code review.',
          allowedTools: ['Bash', 'Read'],
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(2);
    const manifest = results.find((r) => r.path === ROVODEV_PROMPTS_FILE);
    expect(manifest).toBeDefined();
    const parsed = yamlParse(manifest!.content) as {
      prompts: { name: string; description: string; content_file: string }[];
    };
    expect(parsed.prompts).toEqual([
      { name: 'review', description: 'Review code changes', content_file: 'commands/review.md' },
    ]);

    const content = results.find((r) => r.path === `${ROVODEV_COMMANDS_DIR}/review.md`);
    expect(content).toBeDefined();
    expect(content!.content).toBe('Run code review.\n');
    // Content files carry no frontmatter — Rovo Dev sends them verbatim as prompt text.
    expect(content!.content).not.toContain('---');
  });

  it('generates one manifest entry + content file per command, in order', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'review',
          source: '/proj/.agentsmesh/commands/review.md',
          description: 'Review',
          body: 'Do review.',
          allowedTools: [],
        },
        {
          name: 'deploy',
          source: '/proj/.agentsmesh/commands/deploy.md',
          description: 'Deploy',
          body: 'Do deploy.',
          allowedTools: [],
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(3);
    const manifest = results.find((r) => r.path === ROVODEV_PROMPTS_FILE)!;
    const parsed = yamlParse(manifest.content) as { prompts: { name: string }[] };
    expect(parsed.prompts.map((p) => p.name)).toEqual(['review', 'deploy']);
    expect(results.some((r) => r.path === `${ROVODEV_COMMANDS_DIR}/review.md`)).toBe(true);
    expect(results.some((r) => r.path === `${ROVODEV_COMMANDS_DIR}/deploy.md`)).toBe(true);
  });

  it('returns empty when no commands', () => {
    const canonical = makeCanonical({ commands: [] });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(0);
  });

  it('writes an empty content file for a command with a blank body', () => {
    const canonical = makeCanonical({
      commands: [
        {
          name: 'noop',
          source: '/proj/.agentsmesh/commands/noop.md',
          description: 'No-op',
          body: '   \n  ',
          allowedTools: [],
        },
      ],
    });

    const results = generateCommands(canonical);

    const content = results.find((r) => r.path === `${ROVODEV_COMMANDS_DIR}/noop.md`);
    expect(content!.content).toBe('');
  });
});

describe('generateAgents (rovodev)', () => {
  it('generates native subagents with documented frontmatter', () => {
    const canonical = makeCanonical({
      agents: [
        {
          name: 'researcher',
          source: '/proj/.agentsmesh/agents/researcher.md',
          description: 'Research agent',
          body: 'Research topics thoroughly.',
          tools: ['WebSearch'],
          disallowedTools: [],
          model: 'claude-sonnet',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
        },
      ],
    });

    const results = generateAgents(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('.rovodev/subagents/researcher.md');
    expect(results[0].content).toContain('name: researcher');
    expect(results[0].content).toContain('description: Research agent');
    expect(results[0].content).toContain('tools:');
    expect(results[0].content).toContain('Research topics thoroughly.');
  });

  it('returns empty when no agents', () => {
    const canonical = makeCanonical({ agents: [] });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateMcp (rovodev)', () => {
  const MCP = {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
  };

  it('generates ~/.rovodev/mcp_config.json at global scope', () => {
    const canonical = makeCanonical({ mcp: MCP });

    const results = generateMcp(canonical, { scope: 'global', capability: { level: 'native' } });

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(ROVODEV_GLOBAL_MCP_FILE);
    const parsed = JSON.parse(results[0].content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('mcpServers');
    expect(parsed['mcpServers']).toHaveProperty('filesystem');
  });

  it('returns empty at project scope (no project-level MCP file is documented)', () => {
    const canonical = makeCanonical({ mcp: MCP });
    const results = generateMcp(canonical, { scope: 'project', capability: { level: 'none' } });
    expect(results).toHaveLength(0);
  });

  it('returns empty when scope context is omitted (defaults away from global)', () => {
    const canonical = makeCanonical({ mcp: MCP });
    expect(generateMcp(canonical)).toHaveLength(0);
  });

  it('returns empty when no MCP config exists', () => {
    const canonical = makeCanonical({ mcp: null });
    const results = generateMcp(canonical, { scope: 'global', capability: { level: 'native' } });
    expect(results).toHaveLength(0);
  });

  it('returns empty when mcpServers is empty', () => {
    const canonical = makeCanonical({ mcp: { mcpServers: {} } });
    const results = generateMcp(canonical, { scope: 'global', capability: { level: 'native' } });
    expect(results).toHaveLength(0);
  });
});
