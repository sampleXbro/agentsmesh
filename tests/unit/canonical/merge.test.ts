import { describe, it, expect } from 'vitest';
import { mergeCanonicalFiles } from '../../../src/canonical/load/merge.js';
import type {
  CanonicalRule,
  CanonicalCommand,
  CanonicalAgent,
  CanonicalSkill,
  CanonicalFiles,
  McpConfig,
  StdioMcpServer,
  Permissions,
  Hooks,
} from '../../../src/core/types.js';

function rule(slug: string, body: string): CanonicalRule {
  return {
    source: `/x/rules/${slug}.md`,
    root: slug === '_root',
    targets: [],
    description: '',
    globs: [],
    body,
  };
}

function cmd(name: string, body: string): CanonicalCommand {
  return {
    source: `/x/commands/${name}.md`,
    name,
    description: '',
    allowedTools: [],
    body,
  };
}

function agent(name: string): CanonicalAgent {
  return {
    source: `/x/agents/${name}.md`,
    name,
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
  };
}

function skill(name: string): CanonicalSkill {
  return {
    source: `/x/skills/${name}/SKILL.md`,
    name,
    description: '',
    body: '',
    supportingFiles: [],
  };
}

function emptyFiles(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

describe('mergeCanonicalFiles', () => {
  it('returns base when overlay is empty', () => {
    const base = {
      ...emptyFiles(),
      rules: [rule('typescript', 'TS rules')],
    };
    const overlay = emptyFiles();
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.body).toBe('TS rules');
  });

  it('adds overlay rules when no name conflict', () => {
    const base = { ...emptyFiles(), rules: [rule('typescript', 'TS')] };
    const overlay = { ...emptyFiles(), rules: [rule('security', 'Sec')] };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.rules).toHaveLength(2);
    expect(result.rules.map((r) => r.source.split('/').pop()?.replace('.md', ''))).toContain(
      'typescript',
    );
    expect(result.rules.map((r) => r.source.split('/').pop()?.replace('.md', ''))).toContain(
      'security',
    );
  });

  it('overlay rule wins on same slug (e.g. _root)', () => {
    const base = { ...emptyFiles(), rules: [rule('_root', 'base root')] };
    const overlay = { ...emptyFiles(), rules: [rule('_root', 'local root')] };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.body).toBe('local root');
  });

  it('overlay command wins on same name', () => {
    const base = { ...emptyFiles(), commands: [cmd('review', 'base review')] };
    const overlay = { ...emptyFiles(), commands: [cmd('review', 'local review')] };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]?.body).toBe('local review');
  });

  it('adds overlay commands when no name conflict', () => {
    const base = { ...emptyFiles(), commands: [cmd('review', 'R')] };
    const overlay = { ...emptyFiles(), commands: [cmd('lint', 'L')] };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.commands).toHaveLength(2);
    expect(result.commands.map((c) => c.name).sort()).toEqual(['lint', 'review']);
  });

  it('overlay agent wins on same name', () => {
    const base = { ...emptyFiles(), agents: [agent('reviewer')] };
    const overlay = { ...emptyFiles(), agents: [agent('reviewer')] };
    (overlay.agents[0] as CanonicalAgent).body = 'local body';
    (base.agents[0] as CanonicalAgent).body = 'base body';
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.body).toBe('local body');
  });

  it('overlay skill wins on same name', () => {
    const base = { ...emptyFiles(), skills: [skill('api-gen')] };
    const overlay = { ...emptyFiles(), skills: [skill('api-gen')] };
    (overlay.skills[0] as CanonicalSkill).body = 'local skill';
    (base.skills[0] as CanonicalSkill).body = 'base skill';
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.body).toBe('local skill');
  });

  it('merges MCP servers with overlay winning on same name', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      mcp: {
        mcpServers: {
          shared: { type: 'stdio', command: 'npx', args: ['shared-base'], env: {} },
          baseOnly: { type: 'stdio', command: 'base', args: [], env: {} },
        },
      },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      mcp: {
        mcpServers: {
          shared: { type: 'stdio', command: 'npx', args: ['shared-local'], env: {} },
          localOnly: { type: 'stdio', command: 'local', args: [], env: {} },
        },
      },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.mcp).not.toBeNull();
    const servers = (result.mcp as McpConfig).mcpServers;
    expect(Object.keys(servers).sort()).toEqual(['baseOnly', 'localOnly', 'shared']);
    expect((servers['shared'] as StdioMcpServer | undefined)?.args).toEqual(['shared-local']);
  });

  it('merges permissions: union allow, union deny, overlay deny wins', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      permissions: {
        allow: ['Read', 'Grep'],
        deny: ['Bash(rm)'],
      },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      permissions: {
        allow: ['Write'],
        deny: ['Read(secrets)'],
      },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.permissions).not.toBeNull();
    const p = result.permissions as Permissions;
    expect(p.allow?.sort()).toEqual(['Grep', 'Read', 'Write']);
    expect(p.deny?.sort()).toEqual(['Bash(rm)', 'Read(secrets)']);
    expect(p.ask).toBeUndefined();
  });

  it('merges ignore patterns as union', () => {
    const base = { ...emptyFiles(), ignore: ['node_modules', 'dist'] };
    const overlay = { ...emptyFiles(), ignore: ['.env', 'dist'] };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.ignore.sort()).toEqual(['.env', 'dist', 'node_modules']);
  });

  it('overlay hooks override base hooks per key', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: 'base-validate', type: 'command' }],
      },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      hooks: {
        PreToolUse: [{ matcher: 'Bash', command: 'local-validate', type: 'command' }],
      },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.hooks).not.toBeNull();
    const hooks = result.hooks as Hooks;
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse?.[0]?.command).toBe('local-validate');
  });

  it('overlay hooks with empty array falls back to base', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier', type: 'command' }],
      },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      hooks: { PostToolUse: [] },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.hooks).not.toBeNull();
    const hooks = result.hooks as Hooks;
    expect(hooks.PostToolUse).toHaveLength(1);
    expect(hooks.PostToolUse?.[0]?.command).toBe('prettier');
  });

  it('overlay null mcp keeps base mcp', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      mcp: { mcpServers: { x: { type: 'stdio', command: 'x', args: [], env: {} } } },
    };
    const overlay = { ...emptyFiles(), mcp: null };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.mcp).not.toBeNull();
    expect((result.mcp as McpConfig).mcpServers['x']).toBeDefined();
  });

  it('base null permissions with overlay permissions yields overlay', () => {
    const base = { ...emptyFiles(), permissions: null };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      permissions: { allow: ['Read'], deny: [] },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.permissions).toEqual({ allow: ['Read'], deny: [] });
  });

  it('base permissions with overlay null yields base', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      permissions: { allow: ['Read'], deny: ['Bash(rm)'] },
    };
    const overlay = { ...emptyFiles(), permissions: null };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.permissions).toEqual({ allow: ['Read'], deny: ['Bash(rm)'] });
  });

  it('base null mcp with overlay mcp yields overlay', () => {
    const base = { ...emptyFiles(), mcp: null };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      mcp: { mcpServers: { x: { type: 'stdio', command: 'x', args: [], env: {} } } },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.mcp).not.toBeNull();
    expect((result.mcp as McpConfig).mcpServers['x']).toBeDefined();
  });

  it('mergeHooks uses base when overlay key has empty array', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      hooks: { PostToolUse: [{ matcher: 'Write', command: 'prettier', type: 'command' }] },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      hooks: { PostToolUse: [] },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.hooks?.PostToolUse).toHaveLength(1);
    expect(result.hooks?.PostToolUse?.[0]?.command).toBe('prettier');
  });

  it('mergeHooks uses base when overlay lacks key', () => {
    const base: CanonicalFiles = {
      ...emptyFiles(),
      hooks: { PreToolUse: [{ matcher: 'X', command: 'base-cmd', type: 'command' }] },
    };
    const overlay: CanonicalFiles = {
      ...emptyFiles(),
      hooks: { PostToolUse: [{ matcher: 'Y', command: 'local-cmd', type: 'command' }] },
    };
    const result = mergeCanonicalFiles(base, overlay);
    expect(result.hooks?.PreToolUse).toHaveLength(1);
    expect(result.hooks?.PreToolUse?.[0]?.command).toBe('base-cmd');
    expect(result.hooks?.PostToolUse).toHaveLength(1);
    expect(result.hooks?.PostToolUse?.[0]?.command).toBe('local-cmd');
  });
});
