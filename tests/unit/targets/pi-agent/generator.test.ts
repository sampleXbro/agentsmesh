import { describe, it, expect } from 'vitest';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  generateRules,
  generateSkills,
  generateCommands,
  generateAgents,
} from '../../../../src/targets/pi-agent/generator.js';
import {
  PI_AGENT_ROOT_FILE,
  PI_AGENT_SKILLS_DIR,
  PI_AGENT_COMMANDS_DIR,
} from '../../../../src/targets/pi-agent/constants.js';

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

describe('generateRules (pi-agent)', () => {
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
    expect(results[0].path).toBe(PI_AGENT_ROOT_FILE);
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
    expect(results[0].path).toBe(PI_AGENT_ROOT_FILE);
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

  it('includes rules explicitly targeted to pi-agent', () => {
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
          source: '/proj/.agentsmesh/rules/pi-only.md',
          root: false,
          targets: ['pi-agent'],
          description: 'Pi-specific',
          globs: [],
          body: 'Only for Pi.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Only for Pi.');
  });

  it('returns empty when no rules exist', () => {
    const canonical = makeCanonical({ rules: [] });
    const results = generateRules(canonical);
    expect(results).toHaveLength(0);
  });

  it('handles root rule with empty body', () => {
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
    // appendEmbeddedRulesBlock returns null for empty content
    expect(results).toHaveLength(0);
  });

  it('generates AGENTS.md with only non-root rules when no root exists', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/typescript.md',
          root: false,
          targets: [],
          description: 'TS rules',
          globs: [],
          body: 'Use strict mode.',
        },
      ],
    });

    const results = generateRules(canonical);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(PI_AGENT_ROOT_FILE);
    expect(results[0].content).toContain('Use strict mode.');
  });
});

describe('generateSkills (pi-agent)', () => {
  it('generates skills to .pi/skills/', () => {
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
    const skillFile = results.find((r) => r.path === `${PI_AGENT_SKILLS_DIR}/debugging/SKILL.md`);
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('name: debugging');
    expect(skillFile!.content).toContain('description: Debug workflow');
    const refFile = results.find(
      (r) => r.path === `${PI_AGENT_SKILLS_DIR}/debugging/references/checklist.md`,
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

describe('generateCommands (pi-agent)', () => {
  it('emits native .pi/prompts/<name>.md prompt templates', () => {
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

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(`${PI_AGENT_COMMANDS_DIR}/review.md`);
    expect(results[0].content).toContain('description: Review code changes');
    expect(results[0].content).toContain('Run code review.');
    // Pi prompt templates have no skill-projection frontmatter.
    expect(results[0].content).not.toContain('x-agentsmesh-kind');
    expect(results[0].content).not.toContain('SKILL.md');
  });

  it('returns empty when no commands exist', () => {
    const canonical = makeCanonical({ commands: [] });
    const results = generateCommands(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateAgents (pi-agent)', () => {
  it('projects agents as skills', () => {
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
    expect(results[0].path).toContain(`${PI_AGENT_SKILLS_DIR}/`);
    expect(results[0].path).toContain('SKILL.md');
    expect(results[0].content).toContain('researcher');
    const agent = results.find((r) => r.path.endsWith('SKILL.md'));
    expect(agent!.content).toContain('x-agentsmesh-kind: agent');
    expect(agent!.content).toContain('x-agentsmesh-name: researcher');
    expect(agent!.content).toContain('name: am-agent-researcher');
    expect(agent!.content).toContain('description: Research agent');
    expect(agent!.content).toContain('x-agentsmesh-tools:');
    expect(agent!.content).toContain('x-agentsmesh-model: claude-sonnet');
  });

  it('returns empty when no agents exist', () => {
    const canonical = makeCanonical({ agents: [] });
    const results = generateAgents(canonical);
    expect(results).toHaveLength(0);
  });
});

describe('generateCommands (pi-agent) — frontmatter/body edge branches', () => {
  it('omits the description key when the command has no description', () => {
    const out = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/proj/.agentsmesh/commands/bare.md',
            name: 'bare',
            description: '',
            allowedTools: [],
            body: '# Bare\n',
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.path).toBe(`${PI_AGENT_COMMANDS_DIR}/bare.md`);
    expect(out[0]!.content).not.toContain('description:');
    expect(out[0]!.content).toContain('# Bare');
  });

  it('emits an empty body when the command body is whitespace only', () => {
    const out = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/proj/.agentsmesh/commands/empty.md',
            name: 'empty',
            description: 'Has a description',
            allowedTools: [],
            body: '   \n\n  ',
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toContain('description: Has a description');
    expect(out[0]!.content.replace(/---[\s\S]*?---/, '').trim()).toBe('');
  });
});
