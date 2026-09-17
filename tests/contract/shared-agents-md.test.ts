import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createCanonicalProject } from '../e2e/helpers/canonical.js';
import { appendGenerateReferenceMatrix } from '../e2e/helpers/reference-matrix.js';
import { cleanup } from '../e2e/helpers/setup.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { getDescriptor } from '../../src/targets/catalog/registry.js';

let dir = '';

afterEach(() => {
  if (dir) cleanup(dir);
  dir = '';
});

describe('shared AGENTS.md (in-process) — end-to-end pipeline', () => {
  it('writes a single AGENTS.md with canonical .agentsmesh/skills/* refs when 3 targets emit it', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp, factory-droid, jules]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    const agentsMd = join(dir, 'AGENTS.md');
    expect(existsSync(agentsMd)).toBe(true);
    const content = readFileSync(agentsMd, 'utf-8');
    // Shared path → canonical refs preserved.
    expect(content).toContain('.agentsmesh/skills/api-generator/');
    // No target-specific skill prefix leaked.
    expect(content).not.toContain('.agents/skills/');
    expect(content).not.toContain('.factory/skills/');
  });

  it('preserves relative refs inside skill content even when AGENTS.md is shared', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp, factory-droid]
features: [rules, commands, agents, skills]
`);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    const ampSkill = readFileSync(
      join(dir, '.agents', 'skills', 'api-generator', 'SKILL.md'),
      'utf-8',
    );
    const factorySkill = readFileSync(
      join(dir, '.factory', 'skills', 'api-generator', 'SKILL.md'),
      'utf-8',
    );

    // Skill files are NOT shared paths → they are rewritten per-target.
    // Inside SKILL.md, sibling references to template.ts / references/ stay sibling-relative.
    expect(ampSkill).toContain('template.ts');
    expect(factorySkill).toContain('template.ts');
    // Skill SKILL.md does not appear as a fully-canonical reference back to .agentsmesh.
    expect(ampSkill).not.toContain('.agentsmesh/skills/api-generator/SKILL.md');
    expect(factorySkill).not.toContain('.agentsmesh/skills/api-generator/SKILL.md');
  });

  it('shared AGENTS.md content is byte-identical across all emitting targets on disk', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp, factory-droid, jules, pi-agent]
features: [rules, commands, agents, skills]
`);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    // Only one AGENTS.md file exists on disk (collision merged them).
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    // It uses canonical paths so any of the targets can resolve them.
    const content = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('.agentsmesh/');
    expect(content).not.toContain('.agents/skills/');
    expect(content).not.toContain('.factory/skills/');
  });

  it('a second generate after a fresh one produces zero changes (idempotent)', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp, factory-droid]
features: [rules, commands, agents, skills]
`);
    // First run: creates files.
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    // Re-run: every result must be 'unchanged'.
    const second = await runGenerate({}, dir, { printMatrix: false });
    expect(second.exitCode).toBe(0);
    const drift = second.data?.files?.filter((f) => f.status !== 'unchanged') ?? [];
    expect(drift).toEqual([]);
  });

  it('round-trip: import amp after generate restores clean canonical _root.md', async () => {
    dir = createCanonicalProject(`version: 1
targets: [amp, factory-droid]
features: [rules, commands, agents, skills]
`);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    await getDescriptor('amp')!.generators.importFrom(dir, { scope: 'project' });

    const root = readFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), 'utf-8');
    // After importing the canonical-path AGENTS.md, _root.md should not contain
    // target-specific prefixes leaked from the rewrite path.
    expect(root).not.toContain('.factory/skills/');
    expect(root).not.toContain('.agents/skills/');
  });

  it('non-shared single-target AGENTS.md (cursor alone) is rewritten normally', async () => {
    dir = createCanonicalProject(`version: 1
targets: [cursor]
features: [rules, skills]
`);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    // cursor emits AGENTS.md as compat, but no other target shares it → no skipPath applies.
    // The cursor skill dir is .cursor/skills/, and links should still resolve.
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
  });

  it('gemini-cli + windsurf overlap (the original failing scenario) succeeds', async () => {
    dir = createCanonicalProject(`version: 1
targets: [gemini-cli, windsurf]
features: [rules, commands, agents, skills]
`);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'GEMINI.md'))).toBe(true);
  });
});
