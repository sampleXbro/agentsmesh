import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAgents } from '../../../../src/targets/rovodev/generator.js';
import { importFromRovodev } from '../../../../src/targets/rovodev/importer.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'am-rovo-native-agent-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
const empty = (): CanonicalFiles => ({
  rules: [], commands: [], agents: [], skills: [], mcp: null,
  hooks: null, ignore: [], permissions: null,
});
const agent = {
  name: 'code-reviewer', source: '.agentsmesh/agents/code-reviewer.md',
  description: 'Review code changes', body: 'Review commits carefully.',
  tools: ['grep', 'bash'], disallowedTools: [], model: '', permissionMode: '',
  maxTurns: 0, mcpServers: [], hooks: {}, skills: [], memory: '',
};

describe('Rovo Dev first-class subagents', () => {
  it('generates documented markdown agent frontmatter, not projected skills', () => {
    const files = generateAgents({ ...empty(), agents: [agent] });
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('.rovodev/subagents/code-reviewer.md');
    expect(files[0]!.content).toContain('name: code-reviewer');
    expect(files[0]!.content).toContain('description: Review code changes');
    expect(files[0]!.content).toContain('grep');
    expect(files[0]!.content).toContain('Review commits carefully.');
    expect(files[0]!.content).not.toContain('x-agentsmesh-kind');
  });

  it.each(['project', 'global'] as const)('imports %s native subagents', async (scope) => {
    mkdirSync(join(root, '.rovodev/subagents'), { recursive: true });
    writeFileSync(join(root, '.rovodev/subagents/code-reviewer.md'),
      '---\nname: code-reviewer\ndescription: Review code changes\ntools:\n  - grep\n---\nReview commits carefully.\n');
    const results = await importFromRovodev(root, { scope });
    expect(results.filter(x => x.feature === 'agents')).toHaveLength(1);
    expect(results.find(x => x.feature === 'agents')?.toPath)
      .toBe('.agentsmesh/agents/code-reviewer.md');
    const generated = readFileSync(join(root, '.agentsmesh/agents/code-reviewer.md'), 'utf8');
    expect(generated).toContain('Review commits carefully.');
    expect(generated).toContain('grep');
  });

  it('returns no files for empty canonical agents', () => {
    expect(generateAgents(empty())).toEqual([]);
  });
});
