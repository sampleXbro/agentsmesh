import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate, resolveOutputCollisions } from '../../../src/core/generate/engine.js';
import type { CanonicalFiles, GenerateResult } from '../../../src/core/types.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';

const TEST_DIR = join(tmpdir(), 'am-engine-test');

function canonicalWithRootRule(body: string): CanonicalFiles {
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

function minimalConfig(overrides?: Partial<ValidatedConfig>): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code', 'cursor'],
    features: ['rules'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    ...overrides,
  };
}

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('generate', () => {
  it('deduplicates identical results that target the same output path', () => {
    const results: GenerateResult[] = [
      {
        target: 'codex-cli',
        path: 'AGENTS.md',
        content: 'Shared body',
        status: 'created',
      },
      {
        target: 'windsurf',
        path: 'AGENTS.md',
        content: 'Shared body',
        status: 'created',
      },
    ];

    expect(resolveOutputCollisions(results)).toEqual([
      {
        target: 'codex-cli',
        path: 'AGENTS.md',
        content: 'Shared body',
        status: 'created',
      },
    ]);
  });

  it('throws when multiple results target the same path with different content', () => {
    const results: GenerateResult[] = [
      {
        target: 'cline',
        path: 'AGENTS.md',
        content: 'Cline body',
        status: 'created',
      },
      {
        target: 'windsurf',
        path: 'AGENTS.md',
        content: 'Windsurf body',
        status: 'created',
      },
    ];

    expect(() => resolveOutputCollisions(results)).toThrow(
      /Conflicting generated outputs for AGENTS\.md/i,
    );
  });

  it('keeps the preferred AGENTS.md status when discarding a conflicting compatibility output', () => {
    const results: GenerateResult[] = [
      {
        target: 'codex-cli',
        path: 'AGENTS.md',
        content:
          'Shared rules\n\n<!-- agentsmesh:codex-rule-index:start -->\nindex\n<!-- agentsmesh:codex-rule-index:end -->',
        currentContent:
          'Shared rules\n\n<!-- agentsmesh:codex-rule-index:start -->\nindex\n<!-- agentsmesh:codex-rule-index:end -->',
        status: 'unchanged',
      },
      {
        target: 'windsurf',
        path: 'AGENTS.md',
        content: 'Shared rules',
        currentContent:
          'Shared rules\n\n<!-- agentsmesh:codex-rule-index:start -->\nindex\n<!-- agentsmesh:codex-rule-index:end -->',
        status: 'updated',
      },
    ];

    expect(resolveOutputCollisions(results)).toEqual([results[0]]);
  });

  it('produces results for claude-code and cursor when rules feature enabled', async () => {
    const config = minimalConfig();
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results).toHaveLength(4);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('.cursor/rules/general.mdc');
    expect(paths).toContain('.cursor/AGENTS.md');
    expect(paths).toContain('AGENTS.md');
  });

  it('decorates all Cursor root instruction surfaces through the engine', async () => {
    const body = '# Rules\n- Use TypeScript';
    const config = minimalConfig({ targets: ['cursor'] });
    const canonical = canonicalWithRootRule(body);

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    const generalMdc = results.find((result) => result.path === '.cursor/rules/general.mdc');
    const agentsMd = results.find((result) => result.path === 'AGENTS.md');
    const cursorAgentsMd = results.find((result) => result.path === '.cursor/AGENTS.md');
    expect(generalMdc?.content).toContain('## AgentsMesh Generation Contract');
    expect(generalMdc?.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
    expect(agentsMd?.content).toContain('## AgentsMesh Generation Contract');
    expect(agentsMd?.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
    expect(cursorAgentsMd?.content).toContain('## AgentsMesh Generation Contract');
    expect(cursorAgentsMd?.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
  });

  it('marks new files as created when they do not exist', async () => {
    const config = minimalConfig();
    const canonical = canonicalWithRootRule('Content');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const created = results.filter((r) => r.status === 'created');
    expect(created).toHaveLength(4);
  });

  it('marks files as updated when content differs', async () => {
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'CLAUDE.md'), 'Old content');
    writeFileSync(join(TEST_DIR, '.cursor', 'rules', 'general.mdc'), 'Old');
    const config = minimalConfig();
    const canonical = canonicalWithRootRule('New content');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const updated = results.filter((r) => r.status === 'updated');
    expect(updated).toHaveLength(2);
  });

  it('marks files as unchanged when content matches', async () => {
    const body = '# Same';
    mkdirSync(join(TEST_DIR, '.cursor', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    const config = minimalConfig();
    const canonical = canonicalWithRootRule(body);
    const first = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    for (const r of first) {
      const outPath = join(TEST_DIR, r.path);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, r.content);
    }
    const second = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const unchanged = second.filter((r) => r.status === 'unchanged');
    expect(unchanged).toHaveLength(4);
  });

  it('filters targets when targetFilter is provided', async () => {
    const config = minimalConfig();
    const canonical = canonicalWithRootRule('Content');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
      targetFilter: ['claude-code'],
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.target).toBe('claude-code');
  });

  it('skips rules when features does not include rules', async () => {
    const config = minimalConfig({ features: ['mcp'] });
    const canonical = canonicalWithRootRule('Content');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results).toHaveLength(0);
  });

  it('produces command files when commands feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'commands'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Run code review',
          allowedTools: ['Read', 'Grep'],
          body: 'Review changes.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claude/commands/review.md');
    expect(paths).toContain('.cursor/commands/review.md');
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('.cursor/rules/general.mdc');
    expect(paths).toContain('.cursor/AGENTS.md');
    expect(paths).toContain('AGENTS.md');
    expect(results).toHaveLength(6);
  });

  it('skips commands when features does not include commands', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Review',
          allowedTools: [],
          body: 'Body',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const cmdPaths = results.filter((r) => r.path.includes('commands'));
    expect(cmdPaths).toHaveLength(0);
  });

  it('produces agent files when agents feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'agents'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
          name: 'reviewer',
          description: 'Code reviewer',
          tools: ['Read', 'Grep'],
          disallowedTools: [],
          model: 'sonnet',
          permissionMode: 'default',
          maxTurns: 10,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'You are a code reviewer.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claude/agents/reviewer.md');
    expect(paths).toContain('.cursor/agents/reviewer.md');
  });

  it('skips agents when features does not include agents', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
          name: 'reviewer',
          description: 'Review',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Body',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const agentPaths = results.filter((r) => r.path.includes('agents'));
    expect(agentPaths).toHaveLength(0);
  });

  it('produces skill files when skills feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'skills'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'api-gen', 'SKILL.md'),
          name: 'api-gen',
          description: 'Generate REST API endpoints',
          body: 'When asked to create an API endpoint, use project conventions.',
          supportingFiles: [
            {
              relativePath: 'template.ts',
              absolutePath: join(TEST_DIR, '.agentsmesh', 'skills', 'api-gen', 'template.ts'),
              content: 'export const x = 1;',
            },
          ],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claude/skills/api-gen/SKILL.md');
    expect(paths).toContain('.claude/skills/api-gen/template.ts');
    expect(paths).toContain('.cursor/skills/api-gen/SKILL.md');
    expect(paths).toContain('.cursor/skills/api-gen/template.ts');
    expect(results.filter((r) => r.path.includes('skills'))).toHaveLength(4);
  });

  it('skips mcp when features does not include mcp', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
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
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const mcpPaths = results.filter((r) => r.path.includes('mcp.json'));
    expect(mcpPaths).toHaveLength(0);
  });

  it('skips skills when features does not include skills', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'foo', 'SKILL.md'),
          name: 'foo',
          description: 'Foo skill',
          body: 'Body',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const skillPaths = results.filter((r) => r.path.includes('skills'));
    expect(skillPaths).toHaveLength(0);
  });

  it('produces MCP files when mcp feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'mcp'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
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
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.mcp.json');
    expect(paths).toContain('.cursor/mcp.json');
    const mcpResult = results.find((r) => r.path === '.mcp.json');
    expect(mcpResult?.content).toContain('context7');
    expect(mcpResult?.content).toContain('npx');
    expect(mcpResult?.content).toContain('@upstash/context7-mcp');
  });

  it('skips MCP when features does not include mcp', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      mcp: {
        mcpServers: {
          x: { type: 'stdio', command: 'echo', args: [], env: {} },
        },
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const mcpPaths = results.filter((r) => r.path.endsWith('mcp.json'));
    expect(mcpPaths).toHaveLength(0);
  });

  it('produces permissions files when permissions feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: {
        allow: ['Read', 'Grep', 'Bash(npm test)'],
        deny: ['WebFetch', 'Bash(rm -rf)'],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claude/settings.json');
    // Cursor permissions are native — emitted to .cursor/cli.json (not settings.json)
    expect(paths).toContain('.cursor/cli.json');
    expect(paths).not.toContain('.cursor/settings.json');
    const claudePerm = results.find((r) => r.path === '.claude/settings.json');
    expect(claudePerm?.content).toContain('"allow"');
    expect(claudePerm?.content).toContain('"deny"');
    expect(claudePerm?.content).toContain('Read');
    expect(claudePerm?.content).toContain('WebFetch');
  });

  it('skips permissions when features does not include permissions', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: { allow: ['Read'], deny: [] },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const permPaths = results.filter((r) => r.path.includes('settings.json'));
    expect(permPaths).toHaveLength(0);
  });

  it('skips permissions when permissions is null', async () => {
    const config = minimalConfig({ features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: null,
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const permPaths = results.filter((r) => r.path.includes('settings.json'));
    expect(permPaths).toHaveLength(0);
  });

  it('emits empty permissions to revoke previously generated rules', async () => {
    const config = minimalConfig({ features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: { allow: [], deny: [] },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.map((r) => r.path).sort()).toEqual([
      '.claude/settings.json',
      '.cursor/AGENTS.md',
      '.cursor/rules/general.mdc',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    const permissions = results.find((r) => r.path === '.claude/settings.json');
    expect(JSON.parse(permissions?.content ?? '{}')).toEqual({
      permissions: { allow: [], deny: [], ask: [] },
    });
  });

  it('merges permissions into existing settings.json', async () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'settings.json'),
      JSON.stringify(
        { hooks: { PostToolUse: [{ matcher: 'Write', command: 'prettier' }] } },
        null,
        2,
      ),
    );
    const config = minimalConfig({ features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: { allow: ['Read'], deny: [] },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const claudePerm = results.find((r) => r.path === '.claude/settings.json');
    expect(claudePerm).toBeDefined();
    const parsed = JSON.parse(claudePerm!.content) as Record<string, unknown>;
    expect(parsed.permissions).toEqual({ allow: ['Read'], deny: [], ask: [] });
    expect(parsed.hooks).toBeDefined();
    expect((parsed.hooks as Record<string, unknown>).PostToolUse).toBeDefined();
  });

  it('preserves an invalid existing settings.json instead of replacing it', async () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.claude', 'settings.json'), 'not valid json {');
    const config = minimalConfig({ features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: { allow: ['Read'], deny: [] },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const claudePerm = results.find((r) => r.path === '.claude/settings.json');
    expect(claudePerm).toBeDefined();
    // The user's file is kept byte-for-byte: agentsmesh cannot merge into a
    // document it cannot parse, and replacing it would destroy every key.
    expect(claudePerm!.content).toBe('not valid json {');
    expect(claudePerm!.status).toBe('unchanged');
  });

  it('deduplicates identical AGENTS.md outputs from codex-cli and windsurf', async () => {
    const config = minimalConfig({
      targets: ['codex-cli', 'windsurf'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Shared root');

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    expect(results.filter((r) => r.path === 'AGENTS.md')).toHaveLength(1);
    const ag = results.find((r) => r.path === 'AGENTS.md');
    expect(ag?.content).toContain('## AgentsMesh Generation Contract');
    expect(ag?.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
  });

  it('prefers codex AGENTS.md when rewritten overlaps differ between codex-cli and windsurf', async () => {
    const config = minimalConfig({
      targets: ['codex-cli', 'windsurf'],
      features: ['rules', 'skills'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule(
        'Use .agentsmesh/skills/post-feature-qa/ and .agentsmesh/skills/post-feature-qa/references/.',
      ),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'post-feature-qa', 'SKILL.md'),
          name: 'post-feature-qa',
          description: 'QA',
          body: 'Run QA.',
          supportingFiles: [
            {
              relativePath: 'references/checklist.md',
              absolutePath: join(
                TEST_DIR,
                '.agentsmesh',
                'skills',
                'post-feature-qa',
                'references',
                'checklist.md',
              ),
              content: '- check',
            },
          ],
        },
      ],
    };

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    const agentsResult = results.find((r) => r.path === 'AGENTS.md');
    const windsurfAgentsResult = results.find(
      (r) => r.path === 'AGENTS.md' && r.target === 'windsurf',
    );

    expect(agentsResult?.target).toBe('codex-cli');
    expect(agentsResult?.content).toContain('skills/post-feature-qa/');
    expect(agentsResult?.content).toContain('skills/post-feature-qa/references/');
    expect(windsurfAgentsResult).toBeUndefined();
  });
});

describe('generate hooks', () => {
  it('produces hooks files when hooks feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'hooks'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      hooks: {
        PostToolUse: [{ matcher: 'Write|Edit', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claude/settings.json');
    expect(paths).toContain('.cursor/hooks.json');
    const claudeHooks = results.find((r) => r.path === '.claude/settings.json');
    expect(claudeHooks?.content).toContain('PostToolUse');
    expect(claudeHooks?.content).toContain('prettier --write');
  });

  it('skips hooks when features does not include hooks', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const hooksPaths = results.filter((r) => r.path.includes('settings.json'));
    expect(hooksPaths).toHaveLength(0);
  });

  it('skips hooks when hooks is null', async () => {
    const config = minimalConfig({ features: ['rules', 'hooks'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      hooks: null,
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const hooksPaths = results.filter((r) => r.path.includes('settings.json'));
    expect(hooksPaths).toHaveLength(0);
  });

  it('merges hooks into existing settings.json with permissions', async () => {
    mkdirSync(join(TEST_DIR, '.claude'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'], deny: [] } }, null, 2),
    );
    const config = minimalConfig({ features: ['rules', 'hooks'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const claudeSettings = results.find((r) => r.path === '.claude/settings.json');
    expect(claudeSettings).toBeDefined();
    const parsed = JSON.parse(claudeSettings!.content) as Record<string, unknown>;
    expect(parsed.permissions).toEqual({ allow: ['Read'], deny: [], ask: [] });
    expect(parsed.hooks).toBeDefined();
    const hooks = parsed.hooks as Record<string, unknown>;
    expect(hooks.PostToolUse).toBeDefined();
  });

  it('merges permissions and hooks into a single settings.json when both features enabled and no file exists', async () => {
    const config = minimalConfig({ features: ['rules', 'permissions', 'hooks'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      permissions: { allow: ['Bash(pnpm test)'], deny: [] },
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    // Claude: permissions + hooks in settings.json
    const claudeSettings = results.find((r) => r.path === '.claude/settings.json');
    expect(claudeSettings).toBeDefined();
    const claudeParsed = JSON.parse(claudeSettings!.content) as Record<string, unknown>;
    expect(claudeParsed.permissions).toEqual({
      allow: ['Bash(pnpm test)'],
      deny: [],
      ask: [],
    });
    expect(claudeParsed.hooks).toBeDefined();
    expect((claudeParsed.hooks as Record<string, unknown>).PostToolUse).toBeDefined();
    // Cursor: permissions native (.cursor/cli.json), hooks in .cursor/hooks.json
    const cursorSettings = results.find((r) => r.path === '.cursor/settings.json');
    expect(cursorSettings).toBeUndefined();
    const cursorHooks = results.find((r) => r.path === '.cursor/hooks.json');
    expect(cursorHooks).toBeDefined();
    const cursorHooksParsed = JSON.parse(cursorHooks!.content) as Record<string, unknown>;
    expect(cursorHooksParsed.hooks).toBeDefined();
    expect((cursorHooksParsed.hooks as Record<string, unknown>).postToolUse).toBeDefined();
  });
});

describe('generate ignore', () => {
  it('produces ignore files when ignore feature enabled', async () => {
    const config = minimalConfig({ features: ['rules', 'ignore'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      ignore: ['node_modules', '.env', 'dist', 'secrets/'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.claudeignore');
    expect(paths).toContain('.cursorignore');
    const claudeIgnore = results.find((r) => r.path === '.claudeignore');
    const cursorIgnore = results.find((r) => r.path === '.cursorignore');
    expect(claudeIgnore?.content).toContain('node_modules');
    expect(claudeIgnore?.content).toContain('.env');
    expect(cursorIgnore?.content).toContain('node_modules');
    expect(cursorIgnore?.content).toContain('.env');
  });

  it('skips ignore when features does not include ignore', async () => {
    const config = minimalConfig({ features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      ignore: ['node_modules', '.env'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const ignorePaths = results.filter((r) => r.path.endsWith('ignore'));
    expect(ignorePaths).toHaveLength(0);
  });

  it('skips ignore when ignore is empty', async () => {
    const config = minimalConfig({ features: ['rules', 'ignore'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Rules'),
      ignore: [],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const ignorePaths = results.filter((r) => r.path.endsWith('ignore'));
    expect(ignorePaths).toHaveLength(0);
  });
});

describe('generate Copilot', () => {
  it('produces .github/copilot-instructions.md when copilot target enabled', async () => {
    const config = minimalConfig({
      targets: ['claude-code', 'cursor', 'copilot'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('.github/copilot-instructions.md');
    const copilot = results.find((r) => r.path === '.github/copilot-instructions.md');
    expect(copilot?.content).toContain('## AgentsMesh Generation Contract');
    expect(copilot?.content).toContain('Use TypeScript');
  });

  it('produces .github/instructions/*.instructions.md for non-root rules', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root content'),
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root content',
        },
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict mode.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const typescriptRule = results.find(
      (r) => r.path === '.github/instructions/typescript.instructions.md',
    );
    expect(typescriptRule).toBeDefined();
    expect(typescriptRule?.content).toContain('Use strict mode.');
    expect(typescriptRule?.content).toContain('description');
    expect(typescriptRule?.content).toContain('TS rules');
  });

  it('generates Copilot prompt files when commands feature enabled', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'commands'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Run review',
          allowedTools: ['Read'],
          body: 'Review the code.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const copilot = results.find((r) => r.path === '.github/copilot-instructions.md');
    expect(copilot?.content).toContain('## AgentsMesh Generation Contract');
    expect(copilot?.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
    const prompt = results.find((r) => r.path === '.github/prompts/review.prompt.md');
    expect(prompt?.content).toContain('x-agentsmesh-kind: command');
    expect(prompt?.content).toContain('Review the code.');
  });

  it('produces .github/hooks/*.json when hooks feature enabled', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'hooks'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const hookFile = results.find((r) => r.path === '.github/hooks/agentsmesh.json');
    expect(hookFile).toBeDefined();
    expect(hookFile?.content).toContain('"hooks"');
    expect(hookFile?.content).toContain('"postToolUse"');
  });

  it('emits hook wrapper scripts under .github/hooks/scripts and references them from config', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'hooks'],
    });
    mkdirSync(join(TEST_DIR, 'scripts'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, 'scripts', 'validate.sh'),
      '#!/usr/bin/env bash\necho validating\n',
    );
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: './scripts/validate.sh "$TOOL_INPUT"' }],
      },
    };

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    const wrapper = results.find((r) => r.path === '.github/hooks/scripts/pretooluse-0.sh');
    expect(wrapper?.content).toContain('HOOK_DIR=');
    expect(wrapper?.content).toContain('"$HOOK_DIR/scripts/validate.sh" "$TOOL_INPUT"');

    const copiedAsset = results.find((r) => r.path === '.github/hooks/scripts/scripts/validate.sh');
    expect(copiedAsset?.content).toContain('echo validating');
  });

  it('keeps Copilot hook JSON and wrapper scripts consistent when some hook commands are empty', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'hooks'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', command: '' },
          { matcher: 'Edit|Write', command: 'eslint --fix' },
        ],
        Notification: [{ matcher: '.*', command: '' }],
        UserPromptSubmit: [{ matcher: '.*', command: '' }],
      },
    };

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    const hookFile = results.find((r) => r.path === '.github/hooks/agentsmesh.json');
    const wrapperPaths = results
      .filter((r) => r.path.startsWith('.github/hooks/scripts/'))
      .map((r) => r.path)
      .sort();

    expect(hookFile?.content).toContain('"preToolUse"');
    expect(hookFile?.content).toContain('./scripts/pretooluse-0.sh');
    expect(hookFile?.content).not.toContain('"notification"');
    expect(hookFile?.content).not.toContain('"userPromptSubmitted"');
    expect(wrapperPaths).toEqual(['.github/hooks/scripts/pretooluse-0.sh']);
  });
});

describe('generate Copilot target', () => {
  it('produces .github/copilot-instructions.md when copilot in targets', async () => {
    const config = minimalConfig({
      targets: ['claude-code', 'cursor', 'copilot'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const copilotInstructions = results.find(
      (r) => r.target === 'copilot' && r.path === '.github/copilot-instructions.md',
    );
    expect(copilotInstructions).toBeDefined();
    expect(copilotInstructions!.content).toContain('Use TypeScript');
  });

  it('produces .github/instructions/*.instructions.md for non-root rules', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root content'),
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root content',
        },
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          root: false,
          targets: [],
          description: 'TypeScript rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TypeScript.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const contextFile = results.find(
      (r) => r.path === '.github/instructions/typescript.instructions.md',
    );
    expect(contextFile).toBeDefined();
    expect(contextFile!.content).toContain('TypeScript rules');
    expect(contextFile!.content).toContain('Use strict TypeScript');
  });

  it('generates copilot natively: commands as prompt files, agents and skills in native paths', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'commands', 'agents', 'skills'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Run review',
          allowedTools: [],
          body: 'Review the code.',
        },
      ],
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'qa.md'),
          name: 'qa',
          description: 'QA agent',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'You are a QA expert.',
        },
      ],
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'test-gen', 'SKILL.md'),
          name: 'test-gen',
          description: 'Test generator',
          body: 'Generate tests for code.',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const mainFile = results.find((r) => r.path === '.github/copilot-instructions.md');
    expect(mainFile).toBeDefined();
    expect(mainFile!.content).toContain('## AgentsMesh Generation Contract');
    expect(mainFile!.content).toContain('<!-- agentsmesh:root-generation-contract:start -->');
    const promptFile = results.find((r) => r.path === '.github/prompts/review.prompt.md');
    expect(promptFile).toBeDefined();
    expect(promptFile!.content).toContain('Review the code.');
    const agentFile = results.find((r) => r.path === '.github/agents/qa.agent.md');
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('QA agent');
    expect(agentFile!.content).toContain('You are a QA expert.');
    const skillFile = results.find((r) => r.path === '.github/skills/test-gen/SKILL.md');
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain('Test generator');
    expect(skillFile!.content).toContain('Generate tests for code.');
  });

  it('produces .github/hooks/*.json when hooks feature enabled', async () => {
    const config = minimalConfig({
      targets: ['copilot'],
      features: ['rules', 'hooks'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const hookFile = results.find((r) => r.path === '.github/hooks/agentsmesh.json');
    expect(hookFile).toBeDefined();
    expect(hookFile!.content).toContain('"postToolUse"');
  });
});

describe('generate Continue', () => {
  it('decorates the primary .continue root rule through the engine', async () => {
    const config = minimalConfig({
      targets: ['continue'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const root = results.find((r) => r.path === '.continue/rules/general.md');
    expect(root).toBeDefined();
    expect(root?.content).toContain('## AgentsMesh Generation Contract');
    expect(root?.content).toContain('Use TypeScript');
  });
});

describe('generate Cursor root appendix', () => {
  it('decorates general.mdc, workspace AGENTS.md, and .cursor/AGENTS.md', async () => {
    const config = minimalConfig({ targets: ['cursor'], features: ['rules'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('# Root\n'),
      rules: [
        canonicalWithRootRule('# Root\n').rules[0]!,
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'extra.md'),
          root: false,
          targets: ['cursor'],
          description: 'Extra',
          globs: [],
          body: 'Extra body.',
        },
      ],
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    const general = results.find((r) => r.path === '.cursor/rules/general.mdc');
    const agents = results.find((r) => r.path === 'AGENTS.md');
    const cursorAgents = results.find((r) => r.path === '.cursor/AGENTS.md');
    for (const file of [general, agents, cursorAgents]) {
      expect(file).toBeDefined();
      expect(file!.content).toContain('## AgentsMesh Generation Contract');
      expect(file!.content).toContain('agentsmesh.yaml');
    }
  });
});

describe('generate Gemini CLI', () => {
  it('produces GEMINI.md when gemini-cli target enabled', async () => {
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const gemini = results.find((r) => r.path === 'GEMINI.md');
    expect(gemini).toBeDefined();
    expect(gemini!.content).toContain('## AgentsMesh Generation Contract');
    expect(gemini!.content).toContain('Use TypeScript');
    const compatAgents = results.find((r) => r.path === 'AGENTS.md');
    expect(compatAgents).toBeDefined();
    expect(compatAgents!.content).toContain('## AgentsMesh Generation Contract');
    expect(compatAgents!.content).toContain('Use TypeScript');
  });

  it('folds non-root rules as sections into GEMINI.md (no .gemini/rules/ dir)', async () => {
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      rules: [
        canonicalWithRootRule('Root').rules[0]!,
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TS.',
        },
      ],
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    // No separate .gemini/rules/ files
    expect(results.some((r) => r.path.startsWith('.gemini/rules/'))).toBe(false);
    // Non-root rule body is embedded in GEMINI.md
    const gemini = results.find((r) => r.path === 'GEMINI.md');
    expect(gemini).toBeDefined();
    expect(gemini!.content).toContain('Use strict TS.');
    expect(gemini!.content).toContain(
      '<!-- agentsmesh:embedded-rule:start {"source":"rules/ts.md"',
    );
    expect(gemini!.content).not.toContain('"source":"GEMINI.md"');
    expect(gemini!.content).not.toContain('\n---\n<!-- agentsmesh:embedded-rule:start');
  });

  it('produces .gemini/commands/*.toml when commands feature enabled', async () => {
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules', 'commands'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Run review',
          allowedTools: ['Read'],
          body: 'Review the code.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const cmd = results.find((r) => r.path === '.gemini/commands/review.toml');
    expect(cmd).toBeDefined();
    expect(cmd!.content).toContain('description = "Run review"');
  });

  it('produces .gemini/settings.json when mcp, ignore, or hooks enabled', async () => {
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules', 'mcp', 'ignore', 'hooks'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      mcp: {
        mcpServers: {
          fs: { type: 'stdio', command: 'npx', args: ['-y', 'server-fs'], env: {} },
        },
      },
      ignore: ['node_modules', 'dist'],
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier --write $FILE_PATH' }],
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const settings = results.find((r) => r.path === '.gemini/settings.json');
    expect(settings).toBeDefined();
    const parsed = JSON.parse(settings!.content) as Record<string, unknown>;
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.hooks).toBeDefined();
  });

  it('merges Gemini settings with existing .gemini/settings.json', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.gemini', 'settings.json'),
      JSON.stringify({ customKey: 'preserved' }, null, 2),
    );
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules', 'ignore'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['dist'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const settings = results.find((r) => r.path === '.gemini/settings.json');
    expect(settings).toBeUndefined();
    const ignore = results.find((r) => r.path === '.geminiignore');
    expect(ignore?.content).toBe('dist');
  });

  it('replaces invalid existing .gemini/settings.json when merging', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.gemini', 'settings.json'), 'invalid json');
    const config = minimalConfig({
      targets: ['gemini-cli'],
      features: ['rules', 'ignore'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['dist'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const settings = results.find((r) => r.path === '.gemini/settings.json');
    expect(settings).toBeUndefined();
    const ignore = results.find((r) => r.path === '.geminiignore');
    expect(ignore?.content).toBe('dist');
  });
});

describe('generate Cline', () => {
  it('produces AGENTS.md when cline target enabled', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const root = results.find((r) => r.path === 'AGENTS.md');
    expect(root).toBeDefined();
    expect(root!.content).toContain('## AgentsMesh Generation Contract');
    expect(root!.content).toContain('Use TypeScript');
  });

  it('produces .cline/rules/{slug}.md for non-root rules', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'ts.md'),
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['*.ts'],
          body: 'Use strict TS.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const tsRule = results.find((r) => r.path === '.cline/rules/ts.md');
    expect(tsRule).toBeDefined();
    expect(tsRule!.content).toContain('Use strict TS.');
  });

  it('produces .clineignore when ignore feature enabled', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules', 'ignore'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['node_modules', 'dist'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const ign = results.find((r) => r.path === '.clineignore');
    expect(ign).toBeDefined();
    expect(ign!.content).toContain('node_modules');
  });

  it('produces .cline/mcp.json when mcp feature enabled', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules', 'mcp'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      mcp: {
        mcpServers: {
          fs: { type: 'stdio', command: 'npx', args: ['-y', 'server-fs'], env: {} },
        },
      },
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const mcp = results.find((r) => r.path === '.cline/mcp.json');
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content) as Record<string, unknown>;
    expect(parsed.mcpServers).toBeDefined();
  });

  it('produces .cline/skills/{name}/SKILL.md when skills feature enabled', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules', 'skills'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'),
          name: 'review',
          description: 'Code review',
          body: 'Review thoroughly.',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const skill = results.find((r) => r.path === '.cline/skills/review/SKILL.md');
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('Review thoroughly.');
  });

  it('produces .clinerules/workflows/{name}.md when commands feature enabled', async () => {
    const config = minimalConfig({
      targets: ['cline'],
      features: ['rules', 'commands'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'deploy.md'),
          name: 'deploy',
          description: 'Deploy workflow',
          allowedTools: [],
          body: 'Run deploy steps.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const workflow = results.find((r) => r.path === '.clinerules/workflows/deploy.md');
    expect(workflow).toBeDefined();
    expect(workflow!.content).toBe('Deploy workflow\n\nRun deploy steps.');
  });
});

describe('generate Codex', () => {
  it('produces AGENTS.md when codex-cli target enabled', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.find((r) => r.path === 'codex.md')).toBeUndefined();
    const agents = results.find((r) => r.path === 'AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.content).toContain('## AgentsMesh Generation Contract');
    expect(agents!.content).toContain('Use TypeScript');
  });

  it('produces nothing when no root rule (codex-cli)', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule(''),
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
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.filter((r) => r.path === 'AGENTS.md')).toHaveLength(0);
  });

  it('generates skills at .agents/skills/ for codex-cli', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules', 'skills'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'foo', 'SKILL.md'),
          name: 'foo',
          description: 'Foo skill',
          body: 'Foo body',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.every((r) => r.target === 'codex-cli')).toBe(true);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('AGENTS.md');
    expect(paths).not.toContain('codex.md');
    expect(paths).toContain('.agents/skills/foo/SKILL.md');
  });

  it('generates Codex commands as metadata-tagged skills', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules', 'commands'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Review',
          allowedTools: [],
          body: 'Review code.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.every((r) => r.target === 'codex-cli')).toBe(true);
    expect(results.map((r) => r.path).sort()).toEqual([
      '.agents/skills/am-command-review/SKILL.md',
      'AGENTS.md',
    ]);
    const commandSkill = results.find(
      (r) => r.path === '.agents/skills/am-command-review/SKILL.md',
    );
    expect(commandSkill?.content).toContain('x-agentsmesh-kind: command');
  });

  it('skips Codex command-skill projection when disabled in conversions', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules', 'commands'],
      conversions: {
        commands_to_skills: { 'codex-cli': false },
      },
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Review',
          allowedTools: [],
          body: 'Review current code.',
        },
      ],
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    expect(results.map((r) => r.path).sort()).toEqual(['AGENTS.md']);
  });

  it('skips Codex for unsupported features (agents, hooks, ignore, permissions)', async () => {
    const config = minimalConfig({
      targets: ['codex-cli'],
      features: ['rules', 'agents'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
          name: 'reviewer',
          description: 'Reviewer',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: 'default',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Review code.',
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.every((r) => r.target === 'codex-cli')).toBe(true);
    expect(results.map((r) => r.path).sort()).toEqual(['.codex/agents/reviewer.toml', 'AGENTS.md']);
  });
});

describe('generate Windsurf', () => {
  it('produces AGENTS.md and .windsurf/rules/*.md when windsurf target enabled', async () => {
    const config = minimalConfig({
      targets: ['windsurf'],
      features: ['rules'],
    });
    const canonical = canonicalWithRootRule('# Rules\n- Use TypeScript');
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const root = results.find((r) => r.path === 'AGENTS.md');
    expect(root).toBeDefined();
    expect(root!.content).toContain('## AgentsMesh Generation Contract');
    expect(root!.content).toContain('# Rules');
    expect(root!.content).toContain('Use TypeScript');
    expect(root!.content).not.toContain('---');
  });

  it('produces .codeiumignore when windsurf target and ignore feature enabled', async () => {
    const config = minimalConfig({
      targets: ['windsurf'],
      features: ['rules', 'ignore'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['node_modules/', 'dist/'],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    const codeiumIgnore = results.find((r) => r.path === '.codeiumignore');
    expect(codeiumIgnore).toBeDefined();
    expect(codeiumIgnore!.content).toBe('node_modules/\ndist/');
  });

  it('produces nothing when no root rule (windsurf)', async () => {
    const config = minimalConfig({
      targets: ['windsurf'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule(''),
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
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.filter((r) => r.path === 'AGENTS.md')).toHaveLength(0);
  });

  it('generates windsurf workflows and skills when commands/skills features enabled', async () => {
    const config = minimalConfig({
      targets: ['windsurf'],
      features: ['rules', 'commands', 'skills'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Review',
          allowedTools: [],
          body: 'Review code.',
        },
      ],
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'foo', 'SKILL.md'),
          name: 'foo',
          description: 'Foo',
          body: 'Foo body',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });
    expect(results.every((r) => r.target === 'windsurf')).toBe(true);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('.windsurf/workflows/review.md');
    expect(paths).toContain('.windsurf/skills/foo/SKILL.md');
  });

  it('generates windsurf workflows when target=windsurf and feature=commands', async () => {
    const config = minimalConfig({ targets: ['windsurf'], features: ['rules', 'commands'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'deploy.md'),
          name: 'deploy',
          description: 'Deploy',
          allowedTools: [],
          body: 'Deploy steps.',
        },
      ],
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    expect(results.some((r) => r.path === '.windsurf/workflows/deploy.md')).toBe(true);
  });

  it('generates windsurf skills when target=windsurf and feature=skills', async () => {
    const config = minimalConfig({ targets: ['windsurf'], features: ['rules', 'skills'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      skills: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'skills', 'api-gen', 'SKILL.md'),
          name: 'api-gen',
          description: 'API gen',
          body: 'API body.',
          supportingFiles: [],
        },
      ],
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    expect(results.some((r) => r.path === '.windsurf/skills/api-gen/SKILL.md')).toBe(true);
  });

  it('projects agents into skill paths for unsupported agent targets', async () => {
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
          name: 'reviewer',
          description: 'Reviewer',
          tools: ['Read'],
          disallowedTools: [],
          model: 'sonnet',
          permissionMode: 'ask',
          maxTurns: 8,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Review code.',
        },
      ],
    };

    const results = await generate({
      config: minimalConfig({
        targets: ['gemini-cli', 'cline', 'codex-cli', 'windsurf'],
        features: ['rules', 'agents'],
      }),
      canonical,
      projectRoot: TEST_DIR,
    });

    expect(results.some((r) => r.path === '.gemini/agents/reviewer.md')).toBe(true);
    expect(results.some((r) => r.path === '.cline/agents.yaml')).toBe(true);
    expect(results.some((r) => r.path === '.codex/agents/reviewer.toml')).toBe(true);
    expect(results.some((r) => r.path === '.windsurf/skills/am-agent-reviewer/SKILL.md')).toBe(
      true,
    );
  });

  it('skips selected agent-skill projections when disabled in conversions', async () => {
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      agents: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
          name: 'reviewer',
          description: 'Reviewer',
          tools: ['Read'],
          disallowedTools: [],
          model: 'sonnet',
          permissionMode: 'ask',
          maxTurns: 8,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: 'Review code.',
        },
      ],
    };

    const results = await generate({
      config: minimalConfig({
        targets: ['gemini-cli', 'cline', 'codex-cli', 'windsurf'],
        features: ['rules', 'agents'],
        conversions: {
          agents_to_skills: {
            'gemini-cli': false,
            windsurf: false,
          },
        },
      }),
      canonical,
      projectRoot: TEST_DIR,
    });

    // gemini-cli: false = native agents → produces .gemini/agents/*
    expect(results.some((r) => r.path === '.gemini/agents/reviewer.md')).toBe(true);
    expect(results.some((r) => r.path === '.cline/agents.yaml')).toBe(true);
    expect(results.some((r) => r.path === '.codex/agents/reviewer.toml')).toBe(true);
    expect(results.some((r) => r.path === '.windsurf/skills/am-agent-reviewer/SKILL.md')).toBe(
      false,
    );
  });

  it('produces unchanged status for ignore when file already matches', async () => {
    const config = minimalConfig({ targets: ['windsurf'], features: ['rules', 'ignore'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['node_modules', 'dist'],
    };
    // First run creates both ignore files
    const first = await generate({ config, canonical, projectRoot: TEST_DIR });
    const ignoreFirst = first.find((r) => r.path === '.codeiumignore');
    expect(ignoreFirst?.status).toBe('created');
    // Write both files so second run finds them
    const { writeFileAtomic } = await import('../../../src/utils/filesystem/fs.js');
    const { join } = await import('node:path');
    const content = ignoreFirst!.content;
    await writeFileAtomic(join(TEST_DIR, '.codeiumignore'), content);
    // Second run should see 'unchanged' for both
    const second = await generate({ config, canonical, projectRoot: TEST_DIR });
    const codeiumSecond = second.find((r) => r.path === '.codeiumignore');
    expect(codeiumSecond?.status).toBe('unchanged');
  });

  it('produces updated status for ignore when existing file differs', async () => {
    const config = minimalConfig({ targets: ['windsurf'], features: ['rules', 'ignore'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      ignore: ['node_modules'],
    };
    const { writeFileAtomic } = await import('../../../src/utils/filesystem/fs.js');
    const { join } = await import('node:path');
    await writeFileAtomic(join(TEST_DIR, '.codeiumignore'), 'old content\n');
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    const codeiumResult = results.find((r) => r.path === '.codeiumignore');
    expect(codeiumResult?.status).toBe('updated');
  });

  it('produces unchanged status for gemini settings when file already matches', async () => {
    const config = minimalConfig({ targets: ['gemini-cli'], features: ['rules', 'mcp'] });
    const mcp = {
      mcpServers: {
        ctx: { type: 'stdio' as const, command: 'npx', args: ['-y', 'ctx-mcp'], env: {} },
      },
    };
    const canonical: CanonicalFiles = { ...canonicalWithRootRule('Root'), mcp };
    // First run creates the file
    const first = await generate({ config, canonical, projectRoot: TEST_DIR });
    const settingsFirst = first.find((r) => r.path === '.gemini/settings.json');
    expect(settingsFirst?.status).toBe('created');
    // Write file so second run finds it
    const { writeFileAtomic, mkdirp } = await import('../../../src/utils/filesystem/fs.js');
    const { join } = await import('node:path');
    await mkdirp(join(TEST_DIR, '.gemini'));
    await writeFileAtomic(join(TEST_DIR, '.gemini', 'settings.json'), settingsFirst!.content);
    // Second run should see 'unchanged'
    const second = await generate({ config, canonical, projectRoot: TEST_DIR });
    const settingsSecond = second.find((r) => r.path === '.gemini/settings.json');
    expect(settingsSecond?.status).toBe('unchanged');
  });

  it('produces updated status for MCP file when existing content differs', async () => {
    const config = minimalConfig({ features: ['rules', 'mcp'] });
    const mcp = {
      mcpServers: {
        ctx: { type: 'stdio' as const, command: 'npx', args: ['-y', 'ctx-mcp'], env: {} },
      },
    };
    const canonical: CanonicalFiles = { ...canonicalWithRootRule('Root'), mcp };
    mkdirSync(join(TEST_DIR, '.cursor'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.cursor', 'mcp.json'), '{"mcpServers": {}}');
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    const mcpResult = results.find((r) => r.path === '.cursor/mcp.json');
    expect(mcpResult?.status).toBe('updated');
  });

  it('produces unchanged status for MCP file when existing content matches', async () => {
    const config = minimalConfig({ targets: ['cursor'], features: ['rules', 'mcp'] });
    const mcp = {
      mcpServers: {
        ctx: { type: 'stdio' as const, command: 'npx', args: ['-y', 'ctx-mcp'], env: {} },
      },
    };
    const canonical: CanonicalFiles = { ...canonicalWithRootRule('Root'), mcp };
    const first = await generate({ config, canonical, projectRoot: TEST_DIR });
    const mcpFirst = first.find((r) => r.path === '.cursor/mcp.json');
    expect(mcpFirst?.status).toBe('created');
    const { writeFileAtomic, mkdirp } = await import('../../../src/utils/filesystem/fs.js');
    await mkdirp(join(TEST_DIR, '.cursor'));
    await writeFileAtomic(join(TEST_DIR, '.cursor', 'mcp.json'), mcpFirst!.content);
    const second = await generate({ config, canonical, projectRoot: TEST_DIR });
    const mcpSecond = second.find((r) => r.path === '.cursor/mcp.json');
    expect(mcpSecond?.status).toBe('unchanged');
  });

  it('produces .cursor/cli.json for cursor permissions (native capability)', async () => {
    const config = minimalConfig({ targets: ['cursor'], features: ['rules', 'permissions'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      permissions: { allow: ['Read'], deny: [] },
    };
    const results = await generate({ config, canonical, projectRoot: TEST_DIR });
    // cursor permissions are native — written to .cursor/cli.json (not settings.json)
    const permResult = results.find((r) => r.path === '.cursor/cli.json');
    expect(permResult).toBeDefined();
    const parsed = JSON.parse(permResult!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('permissions');
    const perms = parsed.permissions as Record<string, unknown>;
    expect(perms.allow).toEqual(['Read']);
    expect(perms).not.toHaveProperty('deny');
    expect(results.find((r) => r.path === '.cursor/settings.json')).toBeUndefined();
  });

  it('produces unchanged status for hooks settings when content matches', async () => {
    const config = minimalConfig({ targets: ['cursor'], features: ['rules', 'hooks'] });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      hooks: {
        PostToolUse: [{ matcher: 'Write', type: 'command', command: 'npm test' }],
      },
    };
    const first = await generate({ config, canonical, projectRoot: TEST_DIR });
    const hooksFirst = first.find((r) => r.path === '.cursor/settings.json');
    if (!hooksFirst) return; // cursor may not support hooks
    const { writeFileAtomic, mkdirp } = await import('../../../src/utils/filesystem/fs.js');
    await mkdirp(join(TEST_DIR, '.cursor'));
    await writeFileAtomic(join(TEST_DIR, '.cursor', 'settings.json'), hooksFirst.content);
    const second = await generate({ config, canonical, projectRoot: TEST_DIR });
    const hooksSecond = second.find((r) => r.path === '.cursor/settings.json');
    if (hooksSecond) expect(hooksSecond.status).toBe('unchanged');
  });
});

describe('generate OpenCode — scoped settings gate', () => {
  it('writes instructions glob in opencode.json when features includes only rules (no mcp/ignore/hooks/agents/permissions)', async () => {
    // Regression: engine.ts gate at generateScopedSettingsFeature only fired when
    // hasMcp || hasIgnore || hasHooks || hasAgents || hasPermissions — hasRules was absent.
    // With features: ['rules'] alone, emitOpenCodeScopedSettings was never called, so no
    // `instructions` entry was written to opencode.json, making .opencode/rules/*.md invisible.
    const config = minimalConfig({
      targets: ['opencode'],
      features: ['rules'],
    });
    const canonical: CanonicalFiles = {
      ...canonicalWithRootRule('Root'),
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: 'Root',
        },
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TypeScript.',
        },
      ],
    };

    const results = await generate({
      config,
      canonical,
      projectRoot: TEST_DIR,
    });

    const opencodeConfig = results.find(
      (r) => r.target === 'opencode' && r.path === 'opencode.json',
    );
    expect(opencodeConfig).toBeDefined();
    const parsed = JSON.parse(opencodeConfig!.content) as Record<string, unknown>;
    expect(parsed.instructions).toEqual(['.opencode/rules/*.md']);
  });
});
