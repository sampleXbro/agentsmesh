import { describe, it, expect } from 'vitest';
import type { CanonicalFiles, CanonicalRule } from '../../../../src/core/types.js';
import {
  generateRules,
  generateSkills,
  generateCommands,
  generateAgents,
  generateMcp,
  generateIgnore,
  generateHooks,
  generatePermissions,
  renderCodebuffGlobalInstructions,
} from '../../../../src/targets/codebuff/generator.js';
import { generateRules as generateCodexRules } from '../../../../src/targets/codex-cli/generator/rules.js';
import { renderEmbeddedRuleEntries } from '../../../../src/targets/projection/embedded-rule-entries.js';
import {
  CODEBUFF_ROOT_FILE,
  CODEBUFF_SKILLS_DIR,
  CODEBUFF_MCP_FILE,
  CODEBUFF_IGNORE_FILE,
} from '../../../../src/targets/codebuff/constants.js';

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

function makeRule(overrides: Partial<CanonicalRule> = {}): CanonicalRule {
  return {
    source: '/proj/.agentsmesh/rules/example.md',
    root: false,
    targets: [],
    description: '',
    globs: [],
    body: '# Example',
    ...overrides,
  };
}

const rootRule = makeRule({
  source: '/proj/.agentsmesh/rules/_root.md',
  root: true,
  body: '# Standards\n\n- TypeScript strict',
});

describe('generateRules (codebuff)', () => {
  it('returns empty array when there are no rules', () => {
    expect(generateRules(makeCanonical())).toEqual([]);
  });

  it('writes the root rule body verbatim to AGENTS.md', () => {
    const results = generateRules(makeCanonical({ rules: [rootRule] }));

    expect(results).toEqual([
      { path: CODEBUFF_ROOT_FILE, content: '# Standards\n\n- TypeScript strict' },
    ]);
  });

  it('nests a scoped rule as <dir>/AGENTS.md derived from its first glob', () => {
    const typescript = makeRule({
      source: '/proj/.agentsmesh/rules/typescript.md',
      globs: ['src/**/*.ts'],
      body: '# TypeScript\n\n- No any',
    });
    const results = generateRules(makeCanonical({ rules: [rootRule, typescript] }));

    expect(results.map((r) => r.path)).toEqual([CODEBUFF_ROOT_FILE, 'src/AGENTS.md']);
    expect(results[1]?.content).toBe(renderEmbeddedRuleEntries([typescript]));
  });

  it('falls back to the rule slug when no glob yields a directory', () => {
    const results = generateRules(
      makeCanonical({ rules: [makeRule({ source: '/proj/.agentsmesh/rules/style.md' })] }),
    );

    expect(results.map((r) => r.path)).toEqual(['style/AGENTS.md']);
  });

  it('writes rules that collide on one nested path as rule entries', () => {
    const rules = [
      makeRule({ source: '/a/one.md', globs: ['src/**'], body: 'One' }),
      makeRule({ source: '/a/two.md', globs: ['src/**'], body: 'Two' }),
    ];
    const results = generateRules(makeCanonical({ rules }));

    expect(results).toEqual([{ path: 'src/AGENTS.md', content: renderEmbeddedRuleEntries(rules) }]);
  });

  it('skips rules scoped to other targets', () => {
    const results = generateRules(
      makeCanonical({
        rules: [makeRule({ globs: ['src/**'], targets: ['claude-code'] })],
      }),
    );

    expect(results).toEqual([]);
  });

  it('keeps a rule explicitly scoped to codebuff', () => {
    const results = generateRules(
      makeCanonical({ rules: [makeRule({ globs: ['src/**'], targets: ['codebuff'] })] }),
    );

    expect(results.map((r) => r.path)).toEqual(['src/AGENTS.md']);
  });

  it('emits nothing for a root rule with an empty body', () => {
    expect(generateRules(makeCanonical({ rules: [makeRule({ root: true, body: '  ' })] }))).toEqual(
      [],
    );
  });

  it('drops nested groups whose bodies are all blank', () => {
    const results = generateRules(
      makeCanonical({ rules: [makeRule({ globs: ['src/**'], body: '   ' })] }),
    );

    expect(results).toEqual([]);
  });
});

describe('generateRules shared-path byte identity with codex-cli', () => {
  const canonical = makeCanonical({
    rules: [
      rootRule,
      makeRule({
        source: '/proj/.agentsmesh/rules/typescript.md',
        globs: ['src/**/*.ts'],
        body: '# TypeScript\n\n- No any',
      }),
    ],
  });

  it('produces byte-identical AGENTS.md outputs to codex-cli', () => {
    const codex = new Map(generateCodexRules(canonical).map((o) => [o.path, o.content]));

    for (const output of generateRules(canonical)) {
      expect(codex.get(output.path)).toBe(output.content);
    }
  });

  it('keeps the codex-cli nested body as a prefix when an execution rule shares the dir', () => {
    const withExecution = makeCanonical({
      rules: [
        makeRule({ source: '/a/advice.md', globs: ['src/**'], body: 'Advice' }),
        makeRule({
          source: '/a/policy.md',
          globs: ['src/**'],
          body: 'prefix_rule(pattern = ["git"])',
          codexEmit: 'execution',
        }),
      ],
    });

    const ours = generateRules(withExecution).find((o) => o.path === 'src/AGENTS.md');
    const theirs = generateCodexRules(withExecution).find((o) => o.path === 'src/AGENTS.md');

    expect(ours?.content.startsWith(theirs?.content ?? '')).toBe(true);
  });
});

describe('renderCodebuffGlobalInstructions (codebuff)', () => {
  it('embeds non-root rules into the single global knowledge file', () => {
    const content = renderCodebuffGlobalInstructions(
      makeCanonical({
        rules: [rootRule, makeRule({ description: 'Style', globs: ['src/**'], body: 'Be terse.' })],
      }),
    );

    expect(content).toContain('# Standards');
    expect(content).toContain('<!-- agentsmesh:embedded-rules:start -->');
    expect(content).toContain('Be terse.');
  });

  it('returns an empty string when canonical has no rules', () => {
    expect(renderCodebuffGlobalInstructions(makeCanonical())).toBe('');
  });
});

describe('generateSkills / generateCommands (codebuff)', () => {
  it('writes skills to .agents/skills/<name>/SKILL.md with supporting files', () => {
    const results = generateSkills(
      makeCanonical({
        skills: [
          {
            source: '/proj/.agentsmesh/skills/api-generator/SKILL.md',
            name: 'api-generator',
            description: 'Generate API routes',
            body: '# API generator',
            supportingFiles: [
              {
                relativePath: 'references/route-checklist.md',
                absolutePath: '/proj/x.md',
                content: '- check',
              },
            ],
          },
        ],
      }),
    );

    expect(results.map((r) => r.path)).toEqual([
      `${CODEBUFF_SKILLS_DIR}/api-generator/SKILL.md`,
      `${CODEBUFF_SKILLS_DIR}/api-generator/references/route-checklist.md`,
    ]);
    expect(results[0]?.content).toContain('name: api-generator');
  });

  it('projects commands as skills because codebuff has no command file format', () => {
    const results = generateCommands(
      makeCanonical({
        commands: [
          {
            source: '/proj/.agentsmesh/commands/review.md',
            name: 'review',
            description: 'Review the diff',
            allowedTools: [],
            body: 'Review it.',
          },
        ],
      }),
    );

    expect(results.map((r) => r.path)).toEqual([
      `${CODEBUFF_SKILLS_DIR}/am-command-review/SKILL.md`,
    ]);
    expect(results[0]?.content).toContain('x-agentsmesh-kind: command');
  });
});

describe('generateMcp (codebuff)', () => {
  // Strict-schema conformance lives in mcp-format.test.ts; this pins the file shape.
  it('writes .agents/mcp.json under the mcpServers key', () => {
    const results = generateMcp(
      makeCanonical({
        mcp: {
          mcpServers: {
            github: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: {} },
          },
        },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(CODEBUFF_MCP_FILE);
    expect(JSON.parse(results[0]?.content ?? '{}')).toEqual({
      mcpServers: { github: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: {} } },
    });
  });

  it('emits nothing when there are no servers so cleanup can revoke the file', () => {
    expect(generateMcp(makeCanonical({ mcp: { mcpServers: {} } }))).toEqual([]);
    expect(generateMcp(makeCanonical())).toEqual([]);
  });
});

describe('generateIgnore (codebuff)', () => {
  it('writes canonical patterns to .codebuffignore in gitignore syntax', () => {
    expect(generateIgnore(makeCanonical({ ignore: ['dist/', '*.log'] }))).toEqual([
      { path: CODEBUFF_IGNORE_FILE, content: 'dist/\n*.log' },
    ]);
  });

  it('emits nothing when canonical ignore is empty', () => {
    expect(generateIgnore(makeCanonical())).toEqual([]);
  });
});

describe('partial-capability generator stubs (codebuff)', () => {
  it('never emits agent, hook or permission files', () => {
    const canonical = makeCanonical({
      agents: [
        {
          source: '/proj/.agentsmesh/agents/code-reviewer.md',
          name: 'code-reviewer',
          description: 'Reviews',
          tools: ['read_files'],
          disallowedTools: [],
          model: 'anthropic/claude-opus-4',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Review carefully.',
        },
      ],
      hooks: { PreToolUse: [{ command: 'echo hi' }] },
      permissions: { allow: ['Read'], deny: [], ask: [] },
    });

    expect(generateAgents(canonical)).toEqual([]);
    expect(generateHooks(canonical)).toEqual([]);
    expect(generatePermissions(canonical)).toEqual([]);
  });
});
