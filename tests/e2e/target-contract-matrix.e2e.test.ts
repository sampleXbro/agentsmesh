import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup } from './helpers/setup.js';
import { createCanonicalProject } from './helpers/canonical.js';
import { runCli } from './helpers/run-cli.js';
import {
  appendGenerateReferenceMatrix,
  expectedRefs,
  outputPaths,
  type TargetName,
} from './helpers/reference-matrix.js';
import { TARGET_CONTRACTS, TARGET_SPECIFIC_PREFIXES } from './helpers/target-contracts.js';
import { TARGET_IDS } from '../../src/targets/catalog/target-ids.js';
import { lessonsPaths } from '../../src/lessons/paths.js';
import { scaffoldLessons } from '../../src/lessons/init.js';

const TARGETS = Object.keys(TARGET_CONTRACTS) as TargetName[];

/** Targets that do not emit native agent files (import also omits `.agentsmesh/agents/*`). */
const TARGETS_WITHOUT_AGENT_OUTPUT = new Set<TargetName>([
  'amazon-q',
  'codebuff',
  'augment-code',
  'jules',
  'roo-code',
  'trae',
  'zed',
]);

/** Targets whose agents are projected skills (no cross-references in agent body). */
const TARGETS_WITH_PROJECTED_AGENTS = new Set<TargetName>([
  'aider',
  'amp',
  'cline',
  'crush',
  'pi-agent',
  'replit-agent',
  'windsurf',
  'warp',
  'goose',
  'antigravity',
  'continue',
]);

/** Targets whose commands are projected skills (no cross-references in command body). */
const TARGETS_WITH_PROJECTED_COMMANDS = new Set<TargetName>([
  'aider',
  'codebuff',
  'kimi-code',
  'amazon-q',
  'amp',
  'codex-cli',
  'crush',
  'deepagents-cli',
  'goose',
  'jules',
  'kiro',
  'replit-agent',
  'trae',
  'warp',
  'zed',
]);

/** Targets that do not emit any skill artifacts (no `.agentsmesh/skills/*` after round-trip). */
const TARGETS_WITHOUT_SKILL_OUTPUT = new Set<TargetName>(['amazon-q', 'jules', 'zed']);

const MATRIX_CONFIG = `version: 1
targets:
  - aider
  - amazon-q
  - amp
  - augment-code
  - claude-code
  - cursor
  - copilot
  - continue
  - crush
  - deepagents-cli
  - factory-droid
  - goose
  - jules
  - junie
  - gemini-cli
  - cline
  - codebuff
  - codex-cli
  - windsurf
  - antigravity
  - kiro
  - pi-agent
  - replit-agent
  - roo-code
  - rovodev
  - kilo-code
  - kimi-code
  - opencode
  - openhands
  - qwen-code
  - trae
  - warp
  - zed
features:
  - rules
  - commands
  - agents
  - skills
  - mcp
  - hooks
  - ignore
  - permissions
`;

function listFiles(dir: string, base = ''): string[] {
  const root = base ? join(dir, base) : dir;
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFiles(dir, rel);
    return [rel];
  });
}

function generatedFiles(dir: string): string[] {
  return listFiles(dir)
    .filter((file) => file !== 'agentsmesh.yaml')
    .filter((file) => !file.startsWith('.agentsmesh/'))
    .filter((file) => !file.startsWith('.agentsmeshcache'))
    .filter((file) => !file.startsWith('docs/'))
    .sort();
}

function canonicalFiles(dir: string): string[] {
  return listFiles(join(dir, '.agentsmesh'))
    .map((file) => `.agentsmesh/${file}`)
    .sort();
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, path), 'utf-8');
}

/** Activate lessons: scaffold injects the ritual block into canonical _root.md + creates the graph. */
async function activateLessons(dir: string): Promise<void> {
  await scaffoldLessons(dir);
}

function expectNoTargetSpecificPrefixes(content: string): void {
  for (const prefix of TARGET_SPECIFIC_PREFIXES) expect(content).not.toContain(prefix);
}

/** Accept canonical-relative or import-normalized paths from various tool layouts. */
function expectMentionsRelPath(content: string, posixSuffix: string): void {
  if (content.includes(posixSuffix)) return;
  if (content.includes(`./${posixSuffix}`)) return;
  for (let up = 1; up <= 8; up++) {
    if (content.includes(`${'../'.repeat(up)}${posixSuffix}`)) return;
  }
  expect(content).toContain(posixSuffix);
}

/**
 * Path tails after stripping leading tool-root segments (e.g. `.clinerules/workflows/review.md`
 * → `workflows/review.md`, `review.md`).
 */
function pathTails(fullPath: string): string[] {
  const segments = fullPath
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.');
  let start = 0;
  while (
    start < segments.length &&
    segments[start].startsWith('.') &&
    !segments[start].startsWith('..')
  ) {
    start++;
  }
  const rest = segments.slice(start);
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    out.push(rest.slice(i).join('/'));
  }
  return [...new Set(out)].filter(Boolean);
}

function expectAnyPathTail(content: string, fullPath: string): void {
  for (const tail of pathTails(fullPath)) {
    if (content.includes(tail)) return;
    for (let up = 1; up <= 8; up++) {
      if (content.includes(`${'../'.repeat(up)}${tail}`)) return;
    }
  }
  expect(content).toContain(pathTails(fullPath)[0] ?? fullPath);
}

/**
 * Canonical files imported back from a target should anchor at `.agentsmesh/`
 * for prose/inline-code references (both destination and target are under the
 * mesh, so the root-anchor rule applies). Markdown link destinations stay
 * destination-relative because renderers resolve URLs from the file location.
 */
function expectCanonicalizedRoot(content: string): void {
  expect(content).toContain('.agentsmesh/commands/review.md');
  expect(
    content.includes('.agentsmesh/agents/code-reviewer.md') ||
      content.includes('../agents/code-reviewer.md') ||
      content.includes('../../.agentsmesh/agents/code-reviewer.md') ||
      content.includes('agents/code-reviewer.md'),
  ).toBe(true);
  expect(content).toContain('.agentsmesh/skills/api-generator/SKILL.md');
  // Markdown destinations stay destination-relative (URL resolution semantics).
  expect(content).toContain('../skills/api-generator/references/route-checklist.md');
  // Reference-matrix prose cites native paths (e.g. `.factory/droids/`) by design; skip check.
  if (
    !content.includes('## Rewrite Matrix') &&
    !(content.includes('Plain:') && content.includes('Status markers:'))
  ) {
    expectNoTargetSpecificPrefixes(content);
  }
}

function expectCanonicalizedAgent(content: string): void {
  expect(content).toContain('.agentsmesh/commands/review.md');
  expect(content).toContain('.agentsmesh/skills/api-generator/SKILL.md');
  expect(content).toContain('.agentsmesh/skills/api-generator/template.ts');
  expect(content).toContain('skills/api-generator/references/route-checklist.md');
  expectNoTargetSpecificPrefixes(content);
}

function expectCanonicalizedSkill(content: string): void {
  expect(content).toContain('.agentsmesh/commands/review.md');
  expect(content).toContain('.agentsmesh/agents/code-reviewer.md');
  expect(content).toContain('template.ts');
  expect(content).toContain('route-checklist.md');
  expectNoTargetSpecificPrefixes(content);
}

describe('target contract matrix', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('project round-trip contracts list every builtin target', () => {
    expect([...TARGETS].sort()).toEqual([...TARGET_IDS].sort());
  });

  it.each(TARGETS)('generates exact file structure and rewritten links for %s', async (target) => {
    dir = createCanonicalProject(MATRIX_CONFIG);
    appendGenerateReferenceMatrix(dir);

    const result = await runCli(`generate --targets ${target}`, dir);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(generatedFiles(dir)).toEqual(TARGET_CONTRACTS[target].generated);

    const rootPath = outputPaths(target).root[0]!;
    const agentPath = outputPaths(target).agent[0]!;
    const skillPath = outputPaths(target).skill[0]!;
    const refs = expectedRefs(target);
    const rootBody = read(dir, rootPath);
    expectMentionsRelPath(rootBody, 'skills/api-generator/SKILL.md');
    expectMentionsRelPath(rootBody, 'skills/api-generator/references/route-checklist.md');
    if (!TARGETS_WITHOUT_AGENT_OUTPUT.has(target) && !TARGETS_WITH_PROJECTED_AGENTS.has(target)) {
      const agentBody = read(dir, agentPath);
      expectAnyPathTail(agentBody, refs.command);
      expectAnyPathTail(agentBody, refs.skill);
    }
    if (!TARGETS_WITH_PROJECTED_COMMANDS.has(target)) {
      expectAnyPathTail(read(dir, skillPath), refs.command);
    }
    if (!TARGETS_WITHOUT_AGENT_OUTPUT.has(target) && !TARGETS_WITH_PROJECTED_AGENTS.has(target)) {
      expectAnyPathTail(read(dir, skillPath), refs.agent);
    }
    if (target === 'cline') {
      expect(read(dir, 'AGENTS.md')).toContain('# Standards');
      expect(read(dir, '.cline/rules/typescript.md')).toContain(
        'description: TypeScript specific rules',
      );
      expect(read(dir, '.cline/rules/typescript.md')).toContain('paths:');
      expect(read(dir, '.cline/skills/api-generator/SKILL.md')).toContain('name: api-generator');
      expect(read(dir, '.clinerules/workflows/review.md')).toContain(
        'Review current changes for quality.',
      );
      expect(read(dir, '.cline/hooks/posttooluse-0.sh')).toContain('#!/usr/bin/env bash');
      expect(read(dir, '.cline/hooks/posttooluse-0.sh')).toContain(
        '# agentsmesh-command: prettier --write $FILE_PATH',
      );
      expect(read(dir, '.cline/mcp.json')).toContain('"mcpServers"');
    }
  });

  it.each(TARGETS)(
    'round-trips %s with exact canonical structure and canonicalized links',
    async (target) => {
      dir = createCanonicalProject(MATRIX_CONFIG);
      appendGenerateReferenceMatrix(dir);
      await activateLessons(dir);

      const generateResult = await runCli(`generate --targets ${target}`, dir);
      expect(generateResult.exitCode, generateResult.stderr).toBe(0);

      rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });

      const importResult = await runCli(`import --from ${target}`, dir);
      expect(importResult.exitCode, importResult.stderr).toBe(0);
      const expectedImported = [...TARGET_CONTRACTS[target].imported];
      if (!expectedImported.includes('.agentsmesh/mcp.json')) {
        expectedImported.push('.agentsmesh/mcp.json');
      }
      // The import safety net reactivates the subsystem: it recreates lessons.json,
      // seeds the default config.json, AND re-seeds the Tier-2 lessons skill
      // (create-if-missing) for every target, even those that emit no skill
      // artifacts of their own.
      expectedImported.push('.agentsmesh/lessons/lessons.json');
      expectedImported.push('.agentsmesh/lessons/config.json');
      expectedImported.push('.agentsmesh/skills/lessons/SKILL.md');
      expectedImported.sort();
      expect(canonicalFiles(dir)).toEqual(expectedImported);

      const root = read(dir, '.agentsmesh/rules/_root.md');
      expectCanonicalizedRoot(root);
      // The ritual is canonical content wrapped in sentinels — it round-trips back into _root.md.
      expect(root).toContain('<!-- agentsmesh:lessons-contract:start -->');
      expect(existsSync(lessonsPaths(dir).graph)).toBe(true);
      if (!TARGETS_WITHOUT_AGENT_OUTPUT.has(target)) {
        expectCanonicalizedAgent(read(dir, '.agentsmesh/agents/code-reviewer.md'));
      }
      if (!TARGETS_WITHOUT_SKILL_OUTPUT.has(target)) {
        expectCanonicalizedSkill(read(dir, '.agentsmesh/skills/api-generator/SKILL.md'));
      }
    },
  );

  it.each(TARGETS)('keeps %s generate -> import -> generate --check idempotent', async (target) => {
    dir = createCanonicalProject(`version: 1
targets: [${target}]
features: [rules, commands, agents, skills, mcp, hooks, ignore, permissions]
`);
    if (target === 'gemini-cli') {
      rmSync(join(dir, '.agentsmesh', 'rules', 'typescript.md'), { force: true });
    }
    expect((await runCli(`generate --targets ${target}`, dir)).exitCode).toBe(0);
    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });
    expect((await runCli(`import --from ${target}`, dir)).exitCode).toBe(0);
    // Re-emit targets from imported canonical so on-disk natives match what `--check` compares.
    expect((await runCli(`generate --targets ${target}`, dir)).exitCode).toBe(0);

    const checkResult = await runCli(`generate --targets ${target} --check`, dir);
    expect(checkResult.exitCode, `${checkResult.stdout}\n${checkResult.stderr}`).toBe(0);
  });
});
