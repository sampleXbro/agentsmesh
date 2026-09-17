import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { aggregateAnthropicSkillPack } from '../../../../src/sources/anthropic-skill-pack/aggregate.js';

let root = '';

beforeEach(() => {
  root = join(tmpdir(), `am-aggregate-${randomBytes(8).toString('hex')}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeFm(path: string, frontmatter: string, body = ''): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `---\n${frontmatter}\n---\n${body}`);
}

function writeRaw(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('aggregateAnthropicSkillPack — discovery', () => {
  it('aggregates skills, agents, rules, and root commands with exact counts', async () => {
    writeFm(join(root, 'skills', 'lint', 'SKILL.md'), 'description: Lint code', '# Lint');
    writeFm(join(root, 'skills', 'release', 'SKILL.md'), 'description: Release', '# Release');
    writeFm(join(root, 'agents', 'reviewer.md'), 'description: Code reviewer', '# Reviewer');
    writeFm(join(root, 'agents', 'planner.md'), 'description: Planner', '# Planner');
    writeFm(join(root, 'rules', '_root.md'), 'description: Root rule', '# Root');
    writeFm(join(root, 'rules', 'typescript.md'), 'description: TS rule', '# TS');
    writeFm(join(root, 'commands', 'deploy.md'), 'description: Deploy', '# Deploy');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.skills.map((s) => s.name).sort()).toEqual(['lint', 'release']);
    expect(result.agents.map((a) => a.name).sort()).toEqual(['planner', 'reviewer']);
    expect(result.rules).toHaveLength(2);
    expect(result.rules.filter((r) => r.root)).toHaveLength(1);
    expect(result.rules.filter((r) => !r.root)).toHaveLength(1);
    expect(result.commands.map((c) => c.name)).toEqual(['deploy']);
    expect(result.dedups).toEqual([]);
    expect(result.brokenLinks).toEqual([]);
  });

  it('excludes README.md and other boilerplate from agents discovery', async () => {
    writeFm(join(root, 'agents', 'a.md'), 'description: A', '# A');
    writeFm(join(root, 'agents', 'b.md'), 'description: B', '# B');
    writeRaw(join(root, 'agents', 'README.md'), '# Agents directory docs\n');
    writeRaw(join(root, 'agents', 'CONTRIBUTING.md'), '# Contributing\n');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.agents.map((a) => a.name).sort()).toEqual(['a', 'b']);
  });

  it('returns empty arrays and no dedups for an empty contentRoot', async () => {
    const result = await aggregateAnthropicSkillPack(root);
    expect(result.skills).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.commands).toEqual([]);
    expect(result.dedups).toEqual([]);
    expect(result.brokenLinks).toEqual([]);
  });
});

describe('aggregateAnthropicSkillPack — command merging', () => {
  it('merges .claude/commands and .gemini/commands with claude precedence on conflict', async () => {
    writeFm(
      join(root, '.claude', 'commands', 'foo.md'),
      'description: Claude foo',
      '# Claude foo body',
    );
    writeFm(
      join(root, '.gemini', 'commands', 'foo.md'),
      'description: Gemini foo',
      '# Gemini foo body',
    );

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.commands).toHaveLength(1);
    const cmd = result.commands[0]!;
    expect(cmd.name).toBe('foo');
    expect(cmd.description).toBe('Claude foo');
    expect(cmd.body.trim()).toBe('# Claude foo body');
  });

  it('records dedup entries with basename, winnerPath, and loserPaths', async () => {
    writeFm(join(root, '.claude', 'commands', 'foo.md'), 'description: Claude foo', '# x');
    writeFm(join(root, '.gemini', 'commands', 'foo.md'), 'description: Gemini foo', '# y');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.dedups).toHaveLength(1);
    const dedup = result.dedups[0]!;
    expect(dedup.basename).toBe('foo');
    expect(dedup.winnerPath.replaceAll('\\', '/')).toContain('.claude/commands/foo.md');
    expect(dedup.loserPaths.map((p) => p.replaceAll('\\', '/'))).toEqual([
      expect.stringContaining('.gemini/commands/foo.md'),
    ]);
  });

  it('lets explicit root commands/ win over .claude and .gemini variants', async () => {
    writeFm(join(root, 'commands', 'bar.md'), 'description: Root bar', '# root bar');
    writeFm(join(root, '.claude', 'commands', 'bar.md'), 'description: Claude bar', '# claude bar');
    writeFm(join(root, '.gemini', 'commands', 'bar.md'), 'description: Gemini bar', '# gemini bar');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.commands).toHaveLength(1);
    const cmd = result.commands[0]!;
    expect(cmd.description).toBe('Root bar');
    expect(cmd.body.trim()).toBe('# root bar');

    expect(result.dedups).toHaveLength(1);
    const dedup = result.dedups[0]!;
    expect(dedup.basename).toBe('bar');
    expect(dedup.winnerPath.replaceAll('\\', '/')).toContain('/commands/bar.md');
    expect(dedup.winnerPath.replaceAll('\\', '/')).not.toContain('.claude');
    expect(dedup.winnerPath.replaceAll('\\', '/')).not.toContain('.gemini');
    const losers = dedup.loserPaths.map((p) => p.replaceAll('\\', '/')).sort();
    expect(losers).toEqual([
      expect.stringContaining('.claude/commands/bar.md'),
      expect.stringContaining('.gemini/commands/bar.md'),
    ]);
  });
});

describe('aggregateAnthropicSkillPack — link classification', () => {
  it('reports no broken links when a link targets a file inside the skill supportingFiles', async () => {
    writeFm(
      join(root, 'skills', 'lint', 'SKILL.md'),
      'description: Lint code',
      'See [helper](./scripts/lint.sh) for details.\n',
    );
    writeRaw(join(root, 'skills', 'lint', 'scripts', 'lint.sh'), '#!/usr/bin/env bash\n');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.brokenLinks).toEqual([]);
  });

  it('flags a resolvable-outside link when the target lives outside the import scope', async () => {
    writeFm(
      join(root, 'skills', 'lint', 'SKILL.md'),
      'description: Lint code',
      'See [orchestration](../../references/orchestration.md) for context.\n',
    );
    writeRaw(join(root, 'references', 'orchestration.md'), '# Orchestration\n');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.brokenLinks).toHaveLength(1);
    const entry = result.brokenLinks[0]!;
    expect(entry.entityKind).toBe('skill');
    expect(entry.entityName).toBe('lint');
    expect(entry.resolved).toHaveLength(1);
    expect(entry.resolved[0]!.classification).toBe('resolvable-outside');
    expect(entry.resolved[0]!.resolvedRelative).toBe('references/orchestration.md');
  });

  it('flags an unresolvable link when the target does not exist on disk', async () => {
    writeFm(
      join(root, 'skills', 'lint', 'SKILL.md'),
      'description: Lint code',
      'See [missing](../nope.md) for nothing.\n',
    );

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.brokenLinks).toHaveLength(1);
    const entry = result.brokenLinks[0]!;
    expect(entry.entityKind).toBe('skill');
    expect(entry.entityName).toBe('lint');
    expect(entry.resolved).toHaveLength(1);
    expect(entry.resolved[0]!.classification).toBe('unresolvable');
  });

  it('clusters multiple broken links under the same entity entry', async () => {
    writeFm(
      join(root, 'skills', 'lint', 'SKILL.md'),
      'description: Lint code',
      'Outside: [a](../../references/a.md)\nMissing: [b](../nope.md)\n',
    );
    writeRaw(join(root, 'references', 'a.md'), '# A\n');

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.brokenLinks).toHaveLength(1);
    const entry = result.brokenLinks[0]!;
    const classes = entry.resolved.map((r) => r.classification).sort();
    expect(classes).toEqual(['resolvable-outside', 'unresolvable']);
  });

  it('flags broken links on agents and commands as well as skills', async () => {
    writeFm(
      join(root, 'agents', 'reviewer.md'),
      'description: Code reviewer',
      'See [docs](../docs/missing.md).\n',
    );
    writeFm(
      join(root, 'commands', 'deploy.md'),
      'description: Deploy',
      'See [runbook](./runbook.md).\n',
    );

    const result = await aggregateAnthropicSkillPack(root);

    const kinds = result.brokenLinks.map((e) => e.entityKind).sort();
    expect(kinds).toEqual(['agent', 'command']);
  });

  it('flags broken links on rules as well as skills/agents/commands', async () => {
    writeFm(
      join(root, 'rules', 'typescript.md'),
      'description: TS rule',
      'See [strict](./strict-mode.md) for context.\n',
    );

    const result = await aggregateAnthropicSkillPack(root);

    expect(result.brokenLinks).toHaveLength(1);
    const entry = result.brokenLinks[0]!;
    expect(entry.entityKind).toBe('rule');
    expect(entry.entityName).toBe('typescript');
    expect(entry.resolved).toHaveLength(1);
    expect(entry.resolved[0]!.classification).toBe('unresolvable');
  });
});
