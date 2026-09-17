import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferImplicitPickFromNativePath } from '../../../../src/install/native/native-path-pick-infer.js';

const ROOT = join(tmpdir(), 'am-native-path-pick-infer');

function write(rel: string, body = '# x'): void {
  const full = join(ROOT, ...rel.split('/'));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe('inferImplicitPickFromNativePath (descriptor-driven)', () => {
  it('gemini-cli: namespaced command names from .toml/.md', async () => {
    write('.gemini/commands/foo.toml');
    write('.gemini/commands/ns/bar.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.gemini/commands', 'gemini-cli')).toEqual({
      commands: ['foo', 'ns:bar'],
    });
  });

  it('claude-code: commands / rules / agents by basename', async () => {
    write('.claude/commands/a.md');
    write('.claude/rules/b.md');
    write('.claude/agents/c.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.claude/commands', 'claude-code')).toEqual({
      commands: ['a'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.claude/rules', 'claude-code')).toEqual({
      rules: ['b'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.claude/agents', 'claude-code')).toEqual({
      agents: ['c'],
    });
  });

  it('claude-code: skill name from first path segment', async () => {
    write('.claude/skills/myskill/SKILL.md');
    expect(
      await inferImplicitPickFromNativePath(ROOT, '.claude/skills/myskill', 'claude-code'),
    ).toEqual({ skills: ['myskill'] });
  });

  it('cursor: rules via .mdc, commands/agents via .md, skills via skill dir', async () => {
    write('.cursor/rules/r.mdc', '---\nalwaysApply: true\n---\nx');
    write('.cursor/commands/c.md');
    write('.cursor/agents/a.md');
    write('.cursor/skills/s/SKILL.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.cursor/rules', 'cursor')).toEqual({
      rules: ['r'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.cursor/commands', 'cursor')).toEqual({
      commands: ['c'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.cursor/agents', 'cursor')).toEqual({
      agents: ['a'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.cursor/skills', 'cursor')).toEqual({
      skills: ['s'],
    });
  });

  it('copilot: prompts → commands, skills, agents', async () => {
    write('.github/prompts/p.prompt.md');
    write('.github/skills/s/SKILL.md');
    write('.github/agents/a.agent.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.github/prompts', 'copilot')).toEqual({
      commands: ['p'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.github/skills', 'copilot')).toEqual({
      skills: ['s'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.github/agents', 'copilot')).toEqual({
      agents: ['a'],
    });
  });

  it('windsurf: rules by basename', async () => {
    write('.windsurf/rules/r.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.windsurf/rules', 'windsurf')).toEqual({
      rules: ['r'],
    });
  });

  it('cline: skills dir + workflows → commands', async () => {
    write('.cline/skills/s/SKILL.md');
    write('.clinerules/workflows/w.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.cline/skills', 'cline')).toEqual({
      skills: ['s'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.clinerules/workflows', 'cline')).toEqual({
      commands: ['w'],
    });
  });

  it('continue: rules, prompts → commands, skills', async () => {
    write('.continue/rules/r.md');
    write('.continue/prompts/p.md');
    write('.continue/skills/s/SKILL.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.continue/rules', 'continue')).toEqual({
      rules: ['r'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.continue/prompts', 'continue')).toEqual({
      commands: ['p'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.continue/skills', 'continue')).toEqual({
      skills: ['s'],
    });
  });

  it('junie: commands / rules / agents / skills', async () => {
    write('.junie/commands/c.md');
    write('.junie/rules/r.md');
    write('.junie/agents/a.md');
    write('.junie/skills/s/SKILL.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.junie/commands', 'junie')).toEqual({
      commands: ['c'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.junie/rules', 'junie')).toEqual({
      rules: ['r'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.junie/agents', 'junie')).toEqual({
      agents: ['a'],
    });
    expect(await inferImplicitPickFromNativePath(ROOT, '.junie/skills', 'junie')).toEqual({
      skills: ['s'],
    });
  });

  it('codex-cli: .codex/*.md → rules', async () => {
    write('.codex/foo.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.codex', 'codex-cli')).toEqual({
      rules: ['foo'],
    });
  });

  it('returns {} for an unmatched path under a known target', async () => {
    write('.claude/unknown/x.md');
    expect(await inferImplicitPickFromNativePath(ROOT, '.claude/unknown', 'claude-code')).toEqual(
      {},
    );
  });

  it('returns {} for a target without native-install support', async () => {
    expect(await inferImplicitPickFromNativePath(ROOT, '.zed/anything', 'zed')).toEqual({});
  });

  it('returns {} when the native directory is empty', async () => {
    mkdirSync(join(ROOT, '.windsurf', 'rules'), { recursive: true });
    expect(await inferImplicitPickFromNativePath(ROOT, '.windsurf/rules', 'windsurf')).toEqual({});
  });
});
