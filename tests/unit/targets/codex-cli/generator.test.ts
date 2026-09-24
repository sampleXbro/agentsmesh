/**
 * Codex CLI generator tests.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
} from '../../../../src/targets/codex-cli/generator.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import { appendEmbeddedRulesBlock } from '../../../../src/targets/projection/managed-blocks.js';
import { renderEmbeddedRuleEntries } from '../../../../src/targets/projection/embedded-rule-entries.js';
import {
  AGENTS_MD,
  CODEX_AGENTS_DIR,
  CODEX_RULES_DIR,
  CODEX_SKILLS_DIR,
  CODEX_CONFIG_TOML,
} from '../../../../src/targets/codex-cli/constants.js';

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

describe('generateRules (codex-cli)', () => {
  it('generates AGENTS.md from root rule', () => {
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
    expect(results).toHaveLength(1);
    const agents = results.find((r) => r.path === AGENTS_MD);
    expect(agents).toBeDefined();
    expect(agents?.content).toContain('# Rules');
    expect(agents?.content).toContain('- Use TypeScript');
    expect(agents?.content).not.toContain('## AgentsMesh Generation Contract');
    expect(agents?.content).not.toContain('## Additional Rule Files');
  });

  it('outputs only AGENTS.md (no codex.md, no instructions mirror)', () => {
    const body = 'Always use TDD.';
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body,
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results.find((r) => r.path === AGENTS_MD)?.content).toBe(body);
    expect(results.find((r) => r.path === '.codex/instructions/_root.md')).toBeUndefined();
  });

  it('produces no slug directory for an unscoped rule when there is no root AGENTS.md to embed into', () => {
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
    expect(generateRules(canonical)).toEqual([]);
  });

  it('nests advisory rules under a real AGENTS.md Codex loads (directory-scoped)', () => {
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
          description: 'TS',
          globs: ['src/**/*.ts', 'tests/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    const rootFile = results.find((r) => r.path === AGENTS_MD);
    expect(rootFile).toBeDefined();
    expect(rootFile!.content).toBe('# Root');
    const tsRule = results.find((r) => r.path === 'src/AGENTS.md');
    expect(tsRule).toBeDefined();
    expect(tsRule!.content).toBe(renderEmbeddedRuleEntries([canonical.rules[1]!]));
  });

  it('embeds **/*.ts rules (no directory prefix) into the root AGENTS.md instead of a slug dir', () => {
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
          description: 'TS',
          globs: ['**/*.ts'],
          body: 'Strict types.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results.map((r) => r.path)).toEqual([AGENTS_MD]);
    expect(results[0]!.content).toBe(appendEmbeddedRulesBlock('# Root', [canonical.rules[1]!]));
    expect(results[0]!.content).toContain('Strict types.');
  });

  it('writes unscoped override rules to the root AGENTS.override.md, as rule entries', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/a.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'A',
          codexInstructionVariant: 'override',
        },
        {
          source: '/proj/.agentsmesh/rules/b.md',
          root: false,
          targets: [],
          description: '',
          globs: ['**/*.ts'],
          body: 'B',
          codexInstructionVariant: 'override',
        },
      ],
    });
    expect(generateRules(canonical)).toEqual([
      { path: 'AGENTS.override.md', content: renderEmbeddedRuleEntries(canonical.rules) },
    ]);
  });

  it('writes multiple rules that resolve to the same nested AGENTS.md as rule entries', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/a.md',
          root: false,
          targets: [],
          description: '',
          globs: ['src/**'],
          body: 'First.',
        },
        {
          source: '/proj/.agentsmesh/rules/b.md',
          root: false,
          targets: [],
          description: '',
          globs: ['src/**/*.ts'],
          body: 'Second.',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('src/AGENTS.md');
    expect(results[0]!.content).toBe(renderEmbeddedRuleEntries(canonical.rules));
  });

  it('writes AGENTS.override.md for override-variant rules', () => {
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/payments.md',
          root: false,
          targets: [],
          description: '',
          globs: ['services/payments/**'],
          body: 'Payments guidance.',
          codexInstructionVariant: 'override',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('services/payments/AGENTS.override.md');
  });

  it('emits raw Starlark to .rules when codex_emit is execution (no nested mirror)', () => {
    const starlark = 'prefix_rule(\n  pattern = ["git", "status"],\n  decision = "allow",\n)\n';
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
          source: '/proj/.agentsmesh/rules/policy.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: starlark,
          codexEmit: 'execution',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(2);
    const execRule = results.find((r) => r.path === `${CODEX_RULES_DIR}/policy.rules`);
    expect(execRule).toBeDefined();
    expect(execRule!.content.trim()).toContain('prefix_rule');
    expect(results.find((r) => r.path === 'policy/AGENTS.md')).toBeUndefined();
  });

  it('derives the .rules slug from the basename even when source is a Windows absolute path', () => {
    // Regression: on Windows, canonical `rule.source` is a native path with
    // backslashes (e.g. C:\...\.agentsmesh\rules\policy.md). Splitting on '/'
    // only leaves the whole absolute path as the "slug", producing a bogus
    // output path like `.codex/rules/C:\...\.agentsmesh\rules\policy.rules`
    // whose dirname mkdir throws ENOENT on Windows (drive-colon mid-path).
    const canonical = makeCanonical({
      rules: [
        {
          source: 'C:\\Users\\runner\\proj\\.agentsmesh\\rules\\policy.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: 'prefix_rule(\n  pattern = ["git", "status"],\n  decision = "allow",\n)\n',
          codexEmit: 'execution',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(`${CODEX_RULES_DIR}/policy.rules`);
  });

  it('emits comment-only .rules when execution body is markdown text', () => {
    const markdown = '# TypeScript Standards\n\n- Use strict mode\n- Prefer unknown over any';
    const canonical = makeCanonical({
      rules: [
        {
          source: '/proj/.agentsmesh/rules/policy.md',
          root: false,
          targets: [],
          description: '',
          globs: [],
          body: markdown,
          codexEmit: 'execution',
        },
      ],
    });
    const results = generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(`${CODEX_RULES_DIR}/policy.rules`);
    expect(results[0]!.content).toContain(
      '# agentsmesh: canonical execution rule body is not Codex DSL',
    );
    expect(results[0]!.content).toContain('# # TypeScript Standards');
    expect(results[0]!.content).toContain('# - Use strict mode');
    expect(results[0]!.content).toContain('# prefix_rule(');
    expect(results[0]!.content).not.toContain('\nprefix_rule(');
  });

  it('returns empty when rules array is empty', () => {
    expect(generateRules(makeCanonical())).toEqual([]);
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
    expect(results.find((r) => r.path === AGENTS_MD)?.content).toBe('Content');
  });
});

describe('generateSkills (codex-cli)', () => {
  it('generates SKILL.md in .agents/skills/{name}/', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/my-skill/SKILL.md',
          name: 'my-skill',
          description: 'Does something useful',
          body: 'Follow these steps.',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(`${CODEX_SKILLS_DIR}/my-skill/SKILL.md`);
    expect(results[0]!.content).toContain('name: my-skill');
    expect(results[0]!.content).toContain('Follow these steps.');
  });

  it('includes description in frontmatter', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/tdd/SKILL.md',
          name: 'tdd',
          description: 'Test-driven development helper',
          body: 'Write tests first.',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results[0]!.content).toContain('description: Test-driven development helper');
  });

  it('generates supporting files alongside SKILL.md', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/qa/SKILL.md',
          name: 'qa',
          description: 'QA skill',
          body: 'Run QA checks.',
          supportingFiles: [
            {
              relativePath: 'references/checklist.md',
              absolutePath: '/proj/.agentsmesh/skills/qa/references/checklist.md',
              content: '# Checklist\n- item',
            },
          ],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(2);
    const supporting = results.find((r) => r.path.endsWith('checklist.md'));
    expect(supporting).toBeDefined();
    expect(supporting!.path).toBe(`${CODEX_SKILLS_DIR}/qa/references/checklist.md`);
    expect(supporting!.content).toContain('# Checklist');
  });

  it('generates multiple skills', () => {
    const canonical = makeCanonical({
      skills: [
        {
          source: '/proj/.agentsmesh/skills/a/SKILL.md',
          name: 'a',
          description: '',
          body: 'Skill A',
          supportingFiles: [],
        },
        {
          source: '/proj/.agentsmesh/skills/b/SKILL.md',
          name: 'b',
          description: '',
          body: 'Skill B',
          supportingFiles: [],
        },
      ],
    });
    const results = generateSkills(canonical);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.path)).toContain(`${CODEX_SKILLS_DIR}/a/SKILL.md`);
    expect(results.map((r) => r.path)).toContain(`${CODEX_SKILLS_DIR}/b/SKILL.md`);
  });

  it('returns empty when no skills', () => {
    expect(generateSkills(makeCanonical())).toEqual([]);
  });
});

describe('generateCommands (codex-cli)', () => {
  it('generates commands as metadata-tagged reserved skills', () => {
    const canonical = makeCanonical({
      commands: [
        {
          source: '/proj/.agentsmesh/commands/review.md',
          name: 'review',
          description: 'Review changes',
          allowedTools: ['Read', 'Bash(git diff)'],
          body: 'Review the current diff for risk.',
        },
      ],
    });

    const results = generateCommands(canonical);

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(`${CODEX_SKILLS_DIR}/am-command-review/SKILL.md`);
    expect(results[0]?.content).toContain('x-agentsmesh-kind: command');
    expect(results[0]?.content).toContain('x-agentsmesh-name: review');
    expect(results[0]?.content).toContain('x-agentsmesh-allowed-tools:');
    expect(results[0]?.content).toContain('Bash(git diff)');
    expect(results[0]?.content).toContain('Review the current diff for risk.');
  });

  it('returns empty when there are no commands', () => {
    expect(generateCommands(makeCanonical())).toEqual([]);
  });
});

describe('generateAgents (codex-cli)', () => {
  it('generates .codex/agents/*.toml from canonical agents', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/reviewer.md',
          name: 'reviewer',
          description: 'Review specialist',
          tools: ['Read', 'Grep'],
          disallowedTools: ['Bash(rm -rf *)'],
          model: 'gpt-5-codex',
          permissionMode: 'read-only',
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
    expect(results[0]?.path).toBe(`${CODEX_AGENTS_DIR}/reviewer.toml`);
    expect(results[0]?.content).toContain('name = "reviewer"');
    expect(results[0]?.content).toContain('description = "Review specialist"');
    expect(results[0]?.content).toContain('model = "gpt-5-codex"');
    expect(results[0]?.content).toContain('sandbox_mode = "read-only"');
    expect(results[0]?.content).toContain('Review risky changes first.');
  });
});

describe('generateMcp (codex-cli)', () => {
  it('generates .codex/config.toml from canonical MCP', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          'my-server': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@my/server'],
            env: {},
          },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe(CODEX_CONFIG_TOML);
    expect(results[0]!.content).toContain('[mcp_servers.');
    expect(results[0]!.content).toContain('command = "npx"');
    expect(results[0]!.content).toContain('"-y"');
  });

  it('includes env vars in output', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          server: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: { API_KEY: 'secret', REGION: 'us-east-1' },
          },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results[0]!.content).toContain('API_KEY');
    expect(results[0]!.content).toContain('secret');
  });

  it('handles multiple MCP servers', () => {
    const canonical = makeCanonical({
      mcp: {
        mcpServers: {
          alpha: { type: 'stdio', command: 'alpha-cmd', args: [], env: {} },
          beta: { type: 'stdio', command: 'beta-cmd', args: [], env: {} },
        },
      },
    });
    const results = generateMcp(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('alpha-cmd');
    expect(results[0]!.content).toContain('beta-cmd');
  });

  it('returns empty when mcp is null', () => {
    expect(generateMcp(makeCanonical())).toEqual([]);
  });

  it('returns empty when mcpServers is empty', () => {
    const canonical = makeCanonical({ mcp: { mcpServers: {} } });
    expect(generateMcp(canonical)).toEqual([]);
  });
});
