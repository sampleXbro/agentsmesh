import { describe, it, expect } from 'vitest';
import { narrowDiscoveredForInstallScope } from '../../../src/install/core/resource-selection.js';
import type {
  CanonicalAgent,
  CanonicalCommand,
  CanonicalFiles,
  CanonicalRule,
  CanonicalSkill,
} from '../../../src/core/types.js';

function makeRule(partial: Partial<CanonicalRule> = {}): CanonicalRule {
  return {
    source: '.agentsmesh/rules/sample.md',
    root: false,
    targets: [],
    description: '',
    globs: [],
    body: '',
    ...partial,
  };
}

function makeCommand(partial: Partial<CanonicalCommand> = {}): CanonicalCommand {
  return {
    source: '.agentsmesh/commands/sample.md',
    name: 'sample',
    description: '',
    allowedTools: [],
    body: '',
    ...partial,
  };
}

function makeAgent(partial: Partial<CanonicalAgent> = {}): CanonicalAgent {
  return {
    source: '.agentsmesh/agents/sample.md',
    name: 'sample',
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
    ...partial,
  };
}

function makeSkill(partial: Partial<CanonicalSkill> = {}): CanonicalSkill {
  return {
    source: '.agentsmesh/skills/sample/SKILL.md',
    name: 'sample',
    description: '',
    body: '',
    supportingFiles: [],
    ...partial,
  };
}

function files(partial: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...partial,
  };
}

describe('narrowDiscoveredForInstallScope', () => {
  it('returns canonical unchanged when no implicit and no scopedFeatures', () => {
    const c = files({ rules: [makeRule()] });
    const out = narrowDiscoveredForInstallScope(c, {});
    expect(out).toBe(c);
  });

  it('keeps mcp/permissions/hooks/ignore when scopedFeatures includes them', () => {
    const c = files({
      rules: [makeRule()],
      mcp: { mcpServers: { docs: { command: 'npx', args: [], env: {}, type: 'stdio' } } },
      permissions: { allow: ['Read'], deny: [] },
      hooks: { PreToolUse: [{ matcher: '*', command: 'pnpm lint' }] },
      ignore: ['dist'],
    });
    const out = narrowDiscoveredForInstallScope(c, {
      scopedFeatures: ['mcp', 'permissions', 'hooks', 'ignore'],
    });
    expect(out.mcp).not.toBeNull();
    expect(out.permissions).not.toBeNull();
    expect(out.hooks).not.toBeNull();
    expect(out.ignore).toEqual(['dist']);
  });

  it('clears mcp/permissions/hooks/ignore when scopedFeatures excludes them', () => {
    const c = files({
      rules: [makeRule()],
      mcp: { mcpServers: { docs: { command: 'npx', args: [], env: {}, type: 'stdio' } } },
      permissions: { allow: ['Read'], deny: [] },
      hooks: { PreToolUse: [{ matcher: '*', command: 'pnpm lint' }] },
      ignore: ['dist'],
    });
    const out = narrowDiscoveredForInstallScope(c, { scopedFeatures: ['rules'] });
    expect(out.mcp).toBeNull();
    expect(out.permissions).toBeNull();
    expect(out.hooks).toBeNull();
    expect(out.ignore).toEqual([]);
  });

  it('clears skills when scopedFeatures excludes skills', () => {
    const c = files({ skills: [makeSkill({ name: 'a' })] });
    const out = narrowDiscoveredForInstallScope(c, { scopedFeatures: ['rules'] });
    expect(out.skills).toEqual([]);
  });

  it('clears rules when scopedFeatures excludes rules', () => {
    const c = files({ rules: [makeRule({ source: '.agentsmesh/rules/x.md' })] });
    const out = narrowDiscoveredForInstallScope(c, { scopedFeatures: ['skills'] });
    expect(out.rules).toEqual([]);
  });

  it('clears commands when scopedFeatures excludes commands', () => {
    const c = files({ commands: [makeCommand({ name: 'x' })] });
    const out = narrowDiscoveredForInstallScope(c, { scopedFeatures: ['skills'] });
    expect(out.commands).toEqual([]);
  });

  it('clears agents when scopedFeatures excludes agents', () => {
    const c = files({ agents: [makeAgent({ name: 'x' })] });
    const out = narrowDiscoveredForInstallScope(c, { scopedFeatures: ['skills'] });
    expect(out.agents).toEqual([]);
  });

  it('with implicitPick.skills empty array clears skills', () => {
    const c = files({ skills: [makeSkill({ name: 'a' })] });
    const out = narrowDiscoveredForInstallScope(c, { implicitPick: { skills: [] } });
    expect(out.skills).toEqual([]);
  });

  it('with implicitPick.rules empty array clears rules', () => {
    const c = files({ rules: [makeRule({ source: '.agentsmesh/rules/x.md' })] });
    const out = narrowDiscoveredForInstallScope(c, { implicitPick: { rules: [] } });
    expect(out.rules).toEqual([]);
  });

  it('with implicitPick.commands empty array clears commands', () => {
    const c = files({ commands: [makeCommand({ name: 'x' })] });
    const out = narrowDiscoveredForInstallScope(c, { implicitPick: { commands: [] } });
    expect(out.commands).toEqual([]);
  });

  it('with implicitPick.agents empty array clears agents', () => {
    const c = files({ agents: [makeAgent({ name: 'x' })] });
    const out = narrowDiscoveredForInstallScope(c, { implicitPick: { agents: [] } });
    expect(out.agents).toEqual([]);
  });

  it('filters by implicitPick names alongside scopedFeatures', () => {
    const c = files({
      skills: [makeSkill({ name: 'a' }), makeSkill({ name: 'b' })],
      rules: [
        makeRule({ source: '.agentsmesh/rules/keep.md' }),
        makeRule({ source: '.agentsmesh/rules/drop.md' }),
      ],
    });
    const out = narrowDiscoveredForInstallScope(c, {
      implicitPick: { skills: ['a'], rules: ['keep'] },
    });
    expect(out.skills.map((s) => s.name)).toEqual(['a']);
    expect(out.rules.map((r) => r.source)).toContain('.agentsmesh/rules/keep.md');
    expect(out.rules.length).toBe(1);
  });

  it('explicit implicit pick overrides scopedFeatures-derived feature inference', () => {
    const c = files({
      commands: [makeCommand({ name: 'a' }), makeCommand({ name: 'b' })],
    });
    // implicitPick.commands narrows to ['a']
    const out = narrowDiscoveredForInstallScope(c, {
      implicitPick: { commands: ['a'] },
      scopedFeatures: ['commands'],
    });
    expect(out.commands.map((c) => c.name)).toEqual(['a']);
  });
});
