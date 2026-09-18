import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { ImportResult } from '../../../../../src/core/types.js';
import {
  commandSkillRecognizer,
  findDirectorySkills,
  importSkillsDirectory,
  projectedAgentRecognizer,
  readNativeSkill,
  type SkillImportOptions,
  type SkillRecognizer,
} from '../../../../../src/targets/import/shared/skill-import-pipeline.js';

function tmpProject(): string {
  const root = join(tmpdir(), `am-orchestrator-${randomBytes(6).toString('hex')}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function identityNormalize(content: string): string {
  return content;
}

function makeOptions(
  projectRoot: string,
  overrides: Partial<SkillImportOptions> = {},
): {
  options: SkillImportOptions;
  results: ImportResult[];
} {
  const results: ImportResult[] = [];
  return {
    results,
    options: {
      projectRoot,
      destCanonicalSkillsDir: '.agentsmesh/skills',
      targetName: 'tool',
      normalize: identityNormalize,
      results,
      ...overrides,
    },
  };
}

describe('skill-import-pipeline', () => {
  it('readNativeSkill skips reserved filenames and returns SKILL entries', async () => {
    const dir = join(tmpdir(), `am-skill-${Date.now()}`);
    mkdirSync(join(dir, 'my-skill'), { recursive: true });
    writeFileSync(join(dir, 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\n\nx');
    writeFileSync(join(dir, 'my-skill', '.gitkeep'), '');

    const entries = await readNativeSkill(join(dir, 'my-skill'));
    expect(entries.some((e) => e.relativePath === 'SKILL.md')).toBe(true);
    expect(entries.some((e) => e.relativePath === '.gitkeep')).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('readNativeSkill skips a symlinked support file (no-follow exfiltration guard)', async () => {
    const dir = join(tmpdir(), `am-skill-broken-${randomBytes(6).toString('hex')}`);
    mkdirSync(join(dir, 'my-skill'), { recursive: true });
    writeFileSync(join(dir, 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\n\nx');
    // A symlinked support file is skipped by the no-follow reader before it is ever
    // read, so only SKILL.md is imported — a planted symlink cannot pull external
    // bytes into the skill.
    symlinkSync(join(dir, 'my-skill', '.does-not-exist'), join(dir, 'my-skill', 'references.md'));

    const entries = await readNativeSkill(join(dir, 'my-skill'));
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['SKILL.md']);

    rmSync(dir, { recursive: true, force: true });
  });

  it('findDirectorySkills discovers nested SKILL.md roots', async () => {
    const dir = join(tmpdir(), `am-skills-${Date.now()}`);
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    writeFileSync(join(dir, 'a', 'b', 'SKILL.md'), '---\n---\n');

    const map = await findDirectorySkills(dir);
    expect(map.get('b')).toBe(join(dir, 'a', 'b'));

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('importSkillsDirectory', () => {
  it('imports each skill via shared pipeline when no recognizer matches', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/foo'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/foo/SKILL.md'),
        '---\nname: foo\ndescription: f\n---\n\nfoo body',
      );
      writeFileSync(join(root, '.tool/skills/foo/notes.md'), 'note text');

      const { options, results } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options);

      expect(existsSync(join(root, '.agentsmesh/skills/foo/SKILL.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/skills/foo/notes.md'))).toBe(true);
      const skillsResults = results.filter((r) => r.feature === 'skills');
      expect(skillsResults).toHaveLength(2);
      expect(skillsResults.every((r) => r.fromTool === 'tool')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs recognizers in order; first truthy result short-circuits default import', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/bar'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/bar/SKILL.md'),
        '---\nname: bar\nx-claim: first\n---\n\nbar body',
      );

      const order: string[] = [];
      const recognizerA: SkillRecognizer = {
        recognize(ctx) {
          order.push('A');
          if (ctx.frontmatter['x-claim'] === 'first') return true;
          return false;
        },
      };
      const recognizerB: SkillRecognizer = {
        recognize() {
          order.push('B');
          return true;
        },
      };

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [recognizerA, recognizerB]);

      expect(order).toEqual(['A']);
      expect(existsSync(join(root, '.agentsmesh/skills/bar/SKILL.md'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('tries source dirs in order and stops after first non-empty', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/primary-skill'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/primary-skill/SKILL.md'),
        '---\nname: primary-skill\n---\n\nprimary',
      );
      mkdirSync(join(root, '.fallback/skills/fallback-skill'), { recursive: true });
      writeFileSync(
        join(root, '.fallback/skills/fallback-skill/SKILL.md'),
        '---\nname: fallback-skill\n---\n\nfallback',
      );

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills', '.fallback/skills'], options);

      expect(existsSync(join(root, '.agentsmesh/skills/primary-skill/SKILL.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/skills/fallback-skill/SKILL.md'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses fallback dir when primary has no skills', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills'), { recursive: true });
      mkdirSync(join(root, '.fallback/skills/only'), { recursive: true });
      writeFileSync(join(root, '.fallback/skills/only/SKILL.md'), '---\nname: only\n---\n\nonly');

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills', '.fallback/skills'], options);

      expect(existsSync(join(root, '.agentsmesh/skills/only/SKILL.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('projectedAgentRecognizer routes to canonical agents dir and cleans stale skill dir', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/am-agent-reviewer'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/am-agent-reviewer/SKILL.md'),
        `---
name: am-agent-reviewer
description: review code
x-agentsmesh-kind: agent
x-agentsmesh-name: reviewer
---

review body`,
      );
      mkdirSync(join(root, '.agentsmesh/skills/am-agent-reviewer'), { recursive: true });
      writeFileSync(
        join(root, '.agentsmesh/skills/am-agent-reviewer/STALE.md'),
        'stale content from earlier run',
      );

      const { options, results } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [
        projectedAgentRecognizer({ canonicalAgentsDir: '.agentsmesh/agents' }),
      ]);

      expect(existsSync(join(root, '.agentsmesh/agents/reviewer.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/skills/am-agent-reviewer'))).toBe(false);
      const agentResult = results.find((r) => r.feature === 'agents');
      expect(agentResult).toBeDefined();
      expect(agentResult?.toPath).toBe('.agentsmesh/agents/reviewer.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('commandSkillRecognizer routes to canonical commands dir and cleans stale skill dir', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/am-command-deploy'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/am-command-deploy/SKILL.md'),
        `---
name: am-command-deploy
description: deploy app
x-agentsmesh-kind: command
x-agentsmesh-name: deploy
---

deploy body`,
      );
      mkdirSync(join(root, '.agentsmesh/skills/am-command-deploy'), { recursive: true });
      writeFileSync(join(root, '.agentsmesh/skills/am-command-deploy/STALE.md'), 'stale');

      const { options, results } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [
        commandSkillRecognizer({ canonicalCommandsDir: '.agentsmesh/commands' }),
      ]);

      expect(existsSync(join(root, '.agentsmesh/commands/deploy.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/skills/am-command-deploy'))).toBe(false);
      const cmdResult = results.find((r) => r.feature === 'commands');
      expect(cmdResult).toBeDefined();
      expect(cmdResult?.toPath).toBe('.agentsmesh/commands/deploy.md');
      const written = readFileSync(join(root, '.agentsmesh/commands/deploy.md'), 'utf8');
      expect(written).toContain('deploy body');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls through recognizers to default skill import when none match', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/plain'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/plain/SKILL.md'),
        '---\nname: plain\n---\n\nplain body',
      );

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [
        projectedAgentRecognizer({ canonicalAgentsDir: '.agentsmesh/agents' }),
        commandSkillRecognizer({ canonicalCommandsDir: '.agentsmesh/commands' }),
      ]);

      expect(existsSync(join(root, '.agentsmesh/skills/plain/SKILL.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/agents'))).toBe(false);
      expect(existsSync(join(root, '.agentsmesh/commands'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('routes to second recognizer when first does not claim (codex command-then-agent order)', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/am-agent-reviewer'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/am-agent-reviewer/SKILL.md'),
        `---
name: am-agent-reviewer
description: review code
x-agentsmesh-kind: agent
x-agentsmesh-name: reviewer
---

agent body`,
      );

      const { options, results } = makeOptions(root);
      // commandSkill recognizer first (codex CLI uses this order) — it must NOT claim, and
      // projected-agent recognizer (second) must claim.
      await importSkillsDirectory(['.tool/skills'], options, [
        commandSkillRecognizer({ canonicalCommandsDir: '.agentsmesh/commands' }),
        projectedAgentRecognizer({ canonicalAgentsDir: '.agentsmesh/agents' }),
      ]);

      expect(existsSync(join(root, '.agentsmesh/agents/reviewer.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/commands'))).toBe(false);
      expect(results.some((r) => r.feature === 'agents')).toBe(true);
      expect(results.some((r) => r.feature === 'commands')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls through to fallback source dir when primary has SKILL.md entries with broken content', async () => {
    const root = tmpProject();
    try {
      // Primary: a SKILL.md symlink pointing at a non-existent target. findDirectorySkills
      // walks the directory and includes the symlink (basename === 'SKILL.md'), but the
      // orchestrator's readFileSafe returns null on ENOENT, exercising the rawContent===null
      // continue branch AND the importedAny===false fallthrough to the next source dir.
      mkdirSync(join(root, '.tool/skills/broken'), { recursive: true });
      symlinkSync(
        join(root, '.tool/skills/broken/.nonexistent-target.md'),
        join(root, '.tool/skills/broken/SKILL.md'),
      );

      mkdirSync(join(root, '.fallback/skills/real'), { recursive: true });
      writeFileSync(
        join(root, '.fallback/skills/real/SKILL.md'),
        '---\nname: real\n---\n\nreal body',
      );

      const { options, results } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills', '.fallback/skills'], options);

      expect(existsSync(join(root, '.agentsmesh/skills/real/SKILL.md'))).toBe(true);
      expect(existsSync(join(root, '.agentsmesh/skills/broken'))).toBe(false);
      const written = results.filter((r) => r.feature === 'skills');
      expect(written).toHaveLength(1);
      expect(written[0]?.toPath).toBe('.agentsmesh/skills/real/SKILL.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes the destination agent path to normalize() for projected agents', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/am-agent-renamer'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/am-agent-renamer/SKILL.md'),
        `---
name: am-agent-renamer
x-agentsmesh-kind: agent
x-agentsmesh-name: renamer
---

body that should be tagged by normalize`,
      );

      let observedDest = '';
      let observedSource = '';
      const { options } = makeOptions(root, {
        normalize: (content, sourceFile, destinationFile) => {
          observedDest = destinationFile;
          observedSource = sourceFile;
          return content;
        },
      });

      await importSkillsDirectory(['.tool/skills'], options, [
        projectedAgentRecognizer({ canonicalAgentsDir: '.agentsmesh/agents' }),
      ]);

      expect(observedSource).toBe(join(root, '.tool/skills/am-agent-renamer/SKILL.md'));
      expect(observedDest).toBe(join(root, '.agentsmesh/agents/renamer.md'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes the destination command path to normalize() for command skills', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/am-command-build'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/am-command-build/SKILL.md'),
        `---
name: am-command-build
x-agentsmesh-kind: command
x-agentsmesh-name: build
---

body`,
      );

      let observedDest = '';
      const { options } = makeOptions(root, {
        normalize: (content, _sourceFile, destinationFile) => {
          observedDest = destinationFile;
          return content;
        },
      });

      await importSkillsDirectory(['.tool/skills'], options, [
        commandSkillRecognizer({ canonicalCommandsDir: '.agentsmesh/commands' }),
      ]);

      expect(observedDest).toBe(join(root, '.agentsmesh/commands/build.md'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('projectedAgentRecognizer returns false when frontmatter has no x-agentsmesh-kind', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/plain-skill'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/plain-skill/SKILL.md'),
        '---\nname: plain-skill\n---\n\nbody',
      );

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [
        projectedAgentRecognizer({ canonicalAgentsDir: '.agentsmesh/agents' }),
      ]);

      expect(existsSync(join(root, '.agentsmesh/agents'))).toBe(false);
      expect(existsSync(join(root, '.agentsmesh/skills/plain-skill/SKILL.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('commandSkillRecognizer returns false when frontmatter has no x-agentsmesh-kind: command', async () => {
    const root = tmpProject();
    try {
      mkdirSync(join(root, '.tool/skills/agent-not-cmd'), { recursive: true });
      writeFileSync(
        join(root, '.tool/skills/agent-not-cmd/SKILL.md'),
        `---
name: agent-not-cmd
x-agentsmesh-kind: agent
x-agentsmesh-name: foo
---

body`,
      );

      const { options } = makeOptions(root);
      await importSkillsDirectory(['.tool/skills'], options, [
        commandSkillRecognizer({ canonicalCommandsDir: '.agentsmesh/commands' }),
      ]);

      // commandRecognizer must not claim an agent skill; falls back to default skill import
      expect(existsSync(join(root, '.agentsmesh/commands'))).toBe(false);
      expect(existsSync(join(root, '.agentsmesh/skills/agent-not-cmd/SKILL.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
