/**
 * End-to-end path contract for the codebuff target, measured against the real
 * generate/import engine rather than hand-written expectations. Mirrors
 * `tests/contract/target-contract.matrix.test.ts` so the capability-ledger
 * contract file can be derived from output that actually landed on disk.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanonicalProject } from '../../../e2e/helpers/canonical.js';
import { appendGenerateReferenceMatrix } from '../../../e2e/helpers/reference-matrix.js';
import { cleanup } from '../../../e2e/helpers/setup.js';
import { canonicalPathsOnDisk, generatedPathsOnDisk } from '../../../contract/matrix-helpers.js';
import { MATRIX_CONFIG } from '../../../contract/matrix-config.js';
import { assertParsableGeneratedFile } from '../../../contract/parse-generated-shape.js';
import { TARGET_SPECIFIC_PREFIXES } from '../../../contract/contracts/index.js';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { scaffoldLessons } from '../../../../src/lessons/init.js';
import { loadScopedConfig } from '../../../../src/config/core/scope.js';
import { loadCanonicalWithExtends } from '../../../../src/canonical/extends/extends.js';
import { runLint } from '../../../../src/core/lint/linter.js';
import { importFromCodebuff } from '../../../../src/targets/codebuff/importer.js';

const CONFIG = `${MATRIX_CONFIG.replace('targets:\n', 'targets:\n  - codebuff\n')}`;

const EXPECTED_GENERATED = [
  '.agents/mcp.json',
  '.agents/skills/am-command-review/SKILL.md',
  '.agents/skills/api-generator/SKILL.md',
  '.agents/skills/api-generator/references/route-checklist.md',
  '.agents/skills/api-generator/template.ts',
  '.codebuffignore',
  'AGENTS.md',
  'src/AGENTS.md',
];

const EXPECTED_IMPORTED = [
  '.agentsmesh/commands/review.md',
  '.agentsmesh/ignore',
  '.agentsmesh/mcp.json',
  '.agentsmesh/rules/_root.md',
  // The nested src/AGENTS.md carries an embedded-rule block, so the rule
  // returns to its own canonical file instead of a new src.md (#140).
  '.agentsmesh/rules/typescript.md',
  '.agentsmesh/skills/api-generator/SKILL.md',
  '.agentsmesh/skills/api-generator/references/route-checklist.md',
  '.agentsmesh/skills/api-generator/template.ts',
];

function writeRule(root: string, name: string, frontmatter: string, body: string): void {
  writeFileSync(
    join(root, '.agentsmesh/rules', `${name}.md`),
    `---\nroot: false\n${frontmatter}\n---\n\n${body}\n`,
  );
}

let dir = '';

afterEach(() => {
  if (dir) cleanup(dir);
  dir = '';
});

describe('codebuff generate/import path contract', () => {
  it('writes exactly the declared generated paths', async () => {
    dir = createCanonicalProject(CONFIG);
    appendGenerateReferenceMatrix(dir);

    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );
    expect(generatedPathsOnDisk(dir)).toEqual(EXPECTED_GENERATED);
  });

  it('writes files that parse under their on-disk format and leak no foreign prefixes', async () => {
    dir = createCanonicalProject(CONFIG);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );

    for (const rel of EXPECTED_GENERATED) {
      assertParsableGeneratedFile(join(dir, rel), rel);
      const body = readFileSync(join(dir, rel), 'utf-8');
      // Same carve-out as the contract matrix: reference-matrix prose cites
      // native paths on purpose, and the shared generation-contract block names
      // other tools' directories in its own text.
      if (body.includes('## Rewrite Matrix')) continue;
      if (body.includes('Plain:') && body.includes('Status markers:')) continue;
      for (const prefix of TARGET_SPECIFIC_PREFIXES) {
        expect(body, `${rel} leaks ${prefix}`).not.toContain(prefix);
      }
    }
  });

  it('projects and round-trips the lessons ritual through AGENTS.md', async () => {
    dir = createCanonicalProject(CONFIG);
    await scaffoldLessons(dir);
    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );

    const generated = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    expect(generated).toContain('<!-- agentsmesh:lessons-contract:start -->');
    expect(generated).toContain('agentsmesh lessons query');

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    await importFromCodebuff(dir, { scope: 'project' });

    const canonical = readFileSync(join(dir, '.agentsmesh/rules/_root.md'), 'utf-8');
    expect(canonical).toContain('<!-- agentsmesh:lessons-contract:start -->');
    expect(canonical).toContain('agentsmesh lessons add');
  });

  it('lints without errors', async () => {
    dir = createCanonicalProject(CONFIG);
    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );

    const { config, context } = await loadScopedConfig(dir, 'project');
    const { canonical } = await loadCanonicalWithExtends(
      config,
      context.configDir,
      {},
      context.canonicalDir,
    );
    const lint = await runLint(config, canonical, context.rootBase, ['codebuff'], {
      scope: 'project',
    });

    expect(lint.hasErrors, JSON.stringify(lint.diagnostics)).toBe(false);
  });

  it('warns about every partial capability instead of dropping it silently', async () => {
    dir = createCanonicalProject(CONFIG);
    const { config, context } = await loadScopedConfig(dir, 'project');
    const { canonical } = await loadCanonicalWithExtends(
      config,
      context.configDir,
      {},
      context.canonicalDir,
    );

    const lint = await runLint(config, canonical, context.rootBase, ['codebuff'], {
      scope: 'project',
    });
    const files = lint.diagnostics.filter((d) => d.target === 'codebuff').map((d) => d.file);

    expect(files).toContain('.agentsmesh/agents');
    expect(files).toContain('.agentsmesh/permissions.yaml');
    expect(files).toContain('.agentsmesh/hooks.yaml');
  });

  it('imports back exactly the declared canonical paths', async () => {
    dir = createCanonicalProject(CONFIG);
    appendGenerateReferenceMatrix(dir);
    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );
    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });

    await importFromCodebuff(dir, { scope: 'project' });

    expect(canonicalPathsOnDisk(dir)).toEqual(EXPECTED_IMPORTED);
    expect(readFileSync(join(dir, '.agentsmesh/rules/_root.md'), 'utf-8')).toContain(
      '.agentsmesh/commands/review.md',
    );
  });

  it('round-trips a remote mcp server without ever writing a key freebuff rejects', async () => {
    dir = createCanonicalProject(CONFIG);
    writeFileSync(
      join(dir, '.agentsmesh/mcp.json'),
      JSON.stringify({
        mcpServers: {
          sentry: {
            description: 'Hosted error tracking',
            type: 'streamable-http',
            url: 'https://mcp.sentry.dev/mcp',
            headers: { Authorization: 'Bearer $SENTRY_TOKEN' },
            env: { SENTRY_TOKEN: '$SENTRY_TOKEN' },
          },
        },
      }),
    );

    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );

    const written = JSON.parse(readFileSync(join(dir, '.agents/mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(written.mcpServers.sentry).toEqual({
      type: 'http',
      url: 'https://mcp.sentry.dev/mcp',
      headers: { Authorization: 'Bearer $SENTRY_TOKEN' },
    });

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    await importFromCodebuff(dir, { scope: 'project' });

    expect(
      (await runGenerate({ targets: 'codebuff', check: true }, dir, { printMatrix: false }))
        .exitCode,
    ).toBe(0);
  });

  it('is stable across generate -> import -> generate --check', async () => {
    dir = createCanonicalProject(CONFIG);
    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );
    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    await importFromCodebuff(dir, { scope: 'project' });

    expect((await runGenerate({ targets: 'codebuff' }, dir, { printMatrix: false })).exitCode).toBe(
      0,
    );
    expect(
      (await runGenerate({ targets: 'codebuff', check: true }, dir, { printMatrix: false }))
        .exitCode,
    ).toBe(0);
  });
});

describe('codebuff shared-path coexistence', () => {
  it('generates cleanly with codex-cli, which owns .agents/skills and writes AGENTS.md', async () => {
    dir = createCanonicalProject(`version: 1
targets: [codebuff, codex-cli]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);

    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    const generated = generatedPathsOnDisk(dir);
    expect(generated).toContain('AGENTS.md');
    expect(generated).toContain('src/AGENTS.md');
    expect(generated).toContain('.agents/skills/api-generator/SKILL.md');
    expect(generated).toContain('.codebuffignore');
  });

  it('generates cleanly alongside every other AGENTS.md-first target', async () => {
    dir = createCanonicalProject(`version: 1
targets: [codebuff, amp, warp, jules, kiro, cline, opencode, roo-code, junie, factory-droid, rovodev, pi-agent, zed, goose, codex-cli]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);

    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'src/AGENTS.md'))).toBe(true);
  });

  it('generates cleanly with windsurf, the other nested <dir>/AGENTS.md writer', async () => {
    dir = createCanonicalProject(`version: 1
targets: [codebuff, windsurf]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);

    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'src/AGENTS.md'), 'utf-8')).toContain('# TypeScript');
  });

  it('keeps codex-cli rules contiguous in src/AGENTS.md when codebuff-only rules interleave', async () => {
    dir = createCanonicalProject(`version: 1
targets: [codebuff, codex-cli]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);
    writeRule(dir, 'a-shared', "globs: ['src/**']", 'SHARED ONE');
    writeRule(dir, 'm-secret', "globs: ['src/**']\ntargets: ['codebuff']", 'CODEBUFF ONLY');
    writeRule(dir, 'z-shared', "globs: ['src/**']", 'SHARED TWO');

    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    const nested = readFileSync(join(dir, 'src/AGENTS.md'), 'utf-8');
    expect(nested).toContain('SHARED ONE');
    expect(nested).toContain('SHARED TWO');
    expect(nested).toContain('CODEBUFF ONLY');
    // Codex's own string must survive as one contiguous run, or its rules are
    // dropped by the length-based codex collision fallback.
    expect(nested.indexOf('CODEBUFF ONLY')).toBeGreaterThan(nested.indexOf('SHARED TWO'));
  });

  it('generates cleanly with amp and warp, which embed rules into the same AGENTS.md', async () => {
    dir = createCanonicalProject(`version: 1
targets: [codebuff, amp, warp]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);

    expect((await runGenerate({}, dir, { printMatrix: false })).exitCode).toBe(0);

    const root = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    // The richer embedded-block variant wins; codebuff's root body survives inside it.
    expect(root).toContain('# Standards');
    expect(root).toContain('<!-- agentsmesh:embedded-rules:start -->');
  });
});
