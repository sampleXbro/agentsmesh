import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCanonicalSliceAtPath } from '../../../src/canonical/load/load-canonical-slice.js';

const ROOT = join(tmpdir(), 'am-slice-load-test');

describe('load-canonical-slice (load path)', () => {
  beforeEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(ROOT, { recursive: true, force: true });
  });

  it('empty .agentsmesh yields empty canonical (no throw)', async () => {
    const proj = join(ROOT, 'empty-ab');
    mkdirSync(join(proj, '.agentsmesh'), { recursive: true });
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.rules.length).toBe(0);
    expect(c.skills.length).toBe(0);
  });

  it('nested rules/ under project root', async () => {
    const proj = join(ROOT, 'ext');
    mkdirSync(join(proj, 'rules'), { recursive: true });
    writeFileSync(join(proj, 'rules', 'a.md'), '---\ndescription: d\n---\n# A\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.rules.length).toBe(1);
    expect(c.skills.length).toBe(0);
  });

  it('rules directory as slice root', async () => {
    const rules = join(ROOT, 'rules');
    mkdirSync(rules);
    writeFileSync(join(rules, 'b.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(rules);
    expect(c.rules.length).toBe(1);
  });

  it('prefers .agentsmesh when present over loose rules/', async () => {
    const proj = join(ROOT, 'ab');
    mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(join(proj, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n');
    mkdirSync(join(proj, 'rules'));
    writeFileSync(join(proj, 'rules', 'orphan.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.rules.some((r) => r.source.includes('.agentsmesh'))).toBe(true);
  });

  it('throws when nothing installable', async () => {
    const empty = join(ROOT, 'empty');
    mkdirSync(empty);
    await expect(loadCanonicalSliceAtPath(empty)).rejects.toThrow(
      'Hint: pass --as commands|agents|rules|skills',
    );
  });

  it('skill pack at slice root', async () => {
    const sk = join(ROOT, 'pack', 'demo');
    mkdirSync(sk, { recursive: true });
    writeFileSync(join(sk, 'SKILL.md'), '---\ndescription: d\n---\n# D\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(sk);
    expect(c.skills.length).toBe(1);
    expect(c.skills[0]!.name).toBe('demo');
  });

  it('nested commands/ only', async () => {
    const proj = join(ROOT, 'cmd-only');
    mkdirSync(join(proj, 'commands'), { recursive: true });
    writeFileSync(join(proj, 'commands', 'x.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.commands.map((x) => x.name)).toEqual(['x']);
    expect(c.rules.length).toBe(0);
  });

  it('nested agents/ only', async () => {
    const proj = join(ROOT, 'ag-only');
    mkdirSync(join(proj, 'agents'), { recursive: true });
    writeFileSync(join(proj, 'agents', 'bot.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.agents.map((x) => x.name)).toEqual(['bot']);
  });

  it('rules + commands together', async () => {
    const proj = join(ROOT, 'rc');
    mkdirSync(join(proj, 'rules'), { recursive: true });
    mkdirSync(join(proj, 'commands'), { recursive: true });
    writeFileSync(join(proj, 'rules', 'r.md'), '---\ndescription: d\n---\n');
    writeFileSync(join(proj, 'commands', 'c.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.rules.length).toBe(1);
    expect(c.commands.length).toBe(1);
  });

  it('ignores repo boilerplate (README/LICENSE/CONTRIBUTING/SECURITY) in agents/, commands/, rules/', async () => {
    const proj = join(ROOT, 'boiler');
    mkdirSync(join(proj, 'agents'), { recursive: true });
    mkdirSync(join(proj, 'commands'), { recursive: true });
    mkdirSync(join(proj, 'rules'), { recursive: true });
    const stub = '---\ndescription: d\n---\n';
    writeFileSync(join(proj, 'agents', 'README.md'), stub);
    writeFileSync(join(proj, 'agents', 'real.md'), stub);
    writeFileSync(join(proj, 'commands', 'CONTRIBUTING.md'), stub);
    writeFileSync(join(proj, 'commands', 'do.md'), stub);
    writeFileSync(join(proj, 'rules', 'LICENSE.md'), stub);
    writeFileSync(join(proj, 'rules', 'SECURITY.md'), stub);
    writeFileSync(join(proj, 'rules', 'guideline.md'), stub);
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.agents.map((x) => x.name)).toEqual(['real']);
    expect(c.commands.map((x) => x.name)).toEqual(['do']);
    expect(c.rules.map((x) => basename(x.source))).toEqual(['guideline.md']);
  });

  it('merges rules and nested skills/ skill pack', async () => {
    const proj = join(ROOT, 'mixed');
    mkdirSync(join(proj, 'rules'), { recursive: true });
    writeFileSync(join(proj, 'rules', 'z.md'), '---\ndescription: d\n---\n');
    mkdirSync(join(proj, 'skills', 's1'), { recursive: true });
    writeFileSync(join(proj, 'skills', 's1', 'SKILL.md'), '---\ndescription: d\n---\n');
    const { canonical: c } = await loadCanonicalSliceAtPath(proj);
    expect(c.rules.length).toBe(1);
    expect(c.skills.length).toBe(1);
    expect(c.skills[0]!.name).toBe('s1');
  });
});

describe('load-canonical-slice — enableTargetEntityMappers', () => {
  const MROOT = join(tmpdir(), 'am-slice-mappers-test');

  beforeEach(() => {
    rmSync(MROOT, { recursive: true, force: true });
    mkdirSync(MROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(MROOT, { recursive: true, force: true });
  });

  it('reads commands through the target-mapper reader', async () => {
    const proj = join(MROOT, 'cmds');
    mkdirSync(join(proj, 'commands'), { recursive: true });
    writeFileSync(join(proj, 'commands', 'review.md'), '---\ndescription: d\n---\n# Review\n');
    const { canonical, cleanup } = await loadCanonicalSliceAtPath(proj, {
      enableTargetEntityMappers: true,
    });
    expect(canonical.commands.map((c) => c.name)).toEqual(['review']);
    await cleanup();
  });

  it('reads agents through the target-mapper reader', async () => {
    const proj = join(MROOT, 'agents');
    mkdirSync(join(proj, 'agents'), { recursive: true });
    writeFileSync(
      join(proj, 'agents', 'helper.md'),
      '---\nname: helper\ndescription: d\n---\n# Helper\n',
    );
    const { canonical, cleanup } = await loadCanonicalSliceAtPath(proj, {
      enableTargetEntityMappers: true,
    });
    expect(canonical.agents.map((a) => a.name)).toEqual(['helper']);
    await cleanup();
  });

  it('reads rules, commands and agents together with mappers enabled', async () => {
    const proj = join(MROOT, 'all');
    for (const d of ['rules', 'commands', 'agents']) {
      mkdirSync(join(proj, d), { recursive: true });
    }
    writeFileSync(join(proj, 'rules', 'r.md'), '---\ndescription: d\n---\n# R\n');
    writeFileSync(join(proj, 'commands', 'c.md'), '---\ndescription: d\n---\n# C\n');
    writeFileSync(join(proj, 'agents', 'a.md'), '---\nname: a\ndescription: d\n---\n# A\n');
    const { canonical, cleanup } = await loadCanonicalSliceAtPath(proj, {
      enableTargetEntityMappers: true,
    });
    expect(canonical.rules).toHaveLength(1);
    expect(canonical.commands).toHaveLength(1);
    expect(canonical.agents).toHaveLength(1);
    await cleanup();
  });
});
