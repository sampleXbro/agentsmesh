import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './helpers/run-cli.js';
import {
  fileExists,
  fileContains,
  readText,
  validJson,
  dirFilesExactly,
} from './helpers/assertions.js';
import { markdownFrontmatter, markdownHasNoFrontmatter } from './helpers/file-shape.js';
import { useGlobalEnv } from './helpers/global-roundtrip-setup.js';

describe('global mode round-trip: Claude Code', () => {
  const env = useGlobalEnv();

  it('canonical → generate --global → import --global → matches canonical', async () => {
    const { homeDir, canonicalDir, projectDir } = env;
    mkdirSync(join(canonicalDir, 'rules'), { recursive: true });
    mkdirSync(join(canonicalDir, 'commands'), { recursive: true });
    mkdirSync(join(canonicalDir, 'agents'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'test-skill'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'test-skill', 'references'), { recursive: true });

    writeFileSync(
      join(canonicalDir, 'rules', '_root.md'),
      '---\ndescription: Root rules\n---\n# Root\nUse TypeScript strict mode\n',
    );
    writeFileSync(
      join(canonicalDir, 'rules', 'typescript.md'),
      '---\ndescription: TS rules\nglobs: ["src/**/*.ts"]\n---\n# TypeScript\nNo any type\n',
    );
    writeFileSync(
      join(canonicalDir, 'commands', 'review.md'),
      '---\ndescription: Code review\noutput-style: true\nallowed-tools: ["Read", "Grep"]\n---\n# Review\nReview code quality\n',
    );
    writeFileSync(
      join(canonicalDir, 'agents', 'reviewer.md'),
      '---\ndescription: Code reviewer\n---\n# Reviewer\nReview code for quality\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'test-skill', 'SKILL.md'),
      '---\ndescription: Test skill\n---\n# Test Skill\nDoes testing\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'test-skill', 'references', 'checklist.md'),
      '# Checklist\n- Run tests\n',
    );
    writeFileSync(
      join(canonicalDir, 'mcp.json'),
      '{"mcpServers":{"test":{"command":"node","args":[]}}}',
    );
    writeFileSync(join(canonicalDir, 'permissions.yaml'), 'allow:\n  - Read\n  - Grep\n');
    writeFileSync(
      join(canonicalDir, 'hooks.yaml'),
      'PreToolUse:\n  - matcher: ".*"\n    type: command\n    command: echo test\n',
    );
    writeFileSync(join(canonicalDir, 'ignore'), 'node_modules\n');
    writeFileSync(
      join(canonicalDir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [claude-code]\nfeatures: [rules, commands, agents, skills, mcp, permissions, hooks, ignore]\n',
    );

    const gen = await runCli('generate --global --targets claude-code', projectDir);
    expect(gen.exitCode).toBe(0);

    // 1. Global instructions (docs: ~/.claude/CLAUDE.md)
    fileExists(join(homeDir, '.claude', 'CLAUDE.md'));
    fileContains(join(homeDir, '.claude', 'CLAUDE.md'), 'TypeScript strict mode');
    markdownHasNoFrontmatter(join(homeDir, '.claude', 'CLAUDE.md'));

    // 2. Named rules (docs: ~/.claude/rules/*.md)
    fileExists(join(homeDir, '.claude', 'rules', 'typescript.md'));
    fileContains(join(homeDir, '.claude', 'rules', 'typescript.md'), 'No any type');
    expect(
      markdownFrontmatter(join(homeDir, '.claude', 'rules', 'typescript.md')).description,
    ).toBe('TS rules');

    // 3. Settings with permissions and hooks (docs: ~/.claude/settings.json)
    fileExists(join(homeDir, '.claude', 'settings.json'));
    validJson(join(homeDir, '.claude', 'settings.json'));
    const settings = JSON.parse(readText(join(homeDir, '.claude', 'settings.json')));
    expect(settings.permissions?.allow).toContain('Read');
    expect(settings.permissions?.deny).toEqual([]);
    expect(settings.permissions?.ask).toEqual([]);

    // 4. Skills primary (docs: ~/.claude/skills/<skill>/SKILL.md)
    fileExists(join(homeDir, '.claude', 'skills', 'test-skill', 'SKILL.md'));
    fileContains(join(homeDir, '.claude', 'skills', 'test-skill', 'SKILL.md'), 'Does testing');
    expect(
      markdownFrontmatter(join(homeDir, '.claude', 'skills', 'test-skill', 'SKILL.md')).name,
    ).toBe('test-skill');
    fileExists(join(homeDir, '.claude', 'skills', 'test-skill', 'references', 'checklist.md'));

    // 5. Skills compatibility mirror (docs: ~/.agents/skills/)
    fileExists(join(homeDir, '.agents', 'skills', 'test-skill', 'SKILL.md'));
    fileContains(join(homeDir, '.agents', 'skills', 'test-skill', 'SKILL.md'), 'Does testing');
    fileExists(join(homeDir, '.agents', 'skills', 'test-skill', 'references', 'checklist.md'));

    // 5b. Output-styles (descriptor.globalSupport.scopeExtras → ~/.claude/output-styles/, managedOutputs dir)
    fileExists(join(homeDir, '.claude', 'output-styles', 'review.md'));
    fileContains(join(homeDir, '.claude', 'output-styles', 'review.md'), 'Review code quality');

    // 6. Agents (docs: ~/.claude/agents/*.md)
    fileExists(join(homeDir, '.claude', 'agents', 'reviewer.md'));
    fileContains(join(homeDir, '.claude', 'agents', 'reviewer.md'), 'Review code for quality');
    expect(markdownFrontmatter(join(homeDir, '.claude', 'agents', 'reviewer.md')).name).toBe(
      'reviewer',
    );

    // 7. Commands (docs: ~/.claude/commands/*.md)
    fileExists(join(homeDir, '.claude', 'commands', 'review.md'));
    fileContains(join(homeDir, '.claude', 'commands', 'review.md'), 'Review code quality');
    expect(markdownFrontmatter(join(homeDir, '.claude', 'commands', 'review.md')).description).toBe(
      'Code review',
    );

    // 8. Hooks (docs: ~/.claude/settings.json `hooks` — there is no hooks.json)
    validJson(join(homeDir, '.claude', 'settings.json'));
    const hooks = JSON.parse(readText(join(homeDir, '.claude', 'settings.json'))).hooks;
    expect(Array.isArray(hooks.PreToolUse)).toBe(true);

    // 9. Ignore is a permissions.deny Read path pattern, not ~/.claudeignore.
    fileContains(join(homeDir, '.claude', 'settings.json'), 'Read(./node_modules)');

    // 10. MCP (docs: ~/.claude.json)
    fileExists(join(homeDir, '.claude.json'));
    validJson(join(homeDir, '.claude.json'));
    const mcp = JSON.parse(readText(join(homeDir, '.claude.json')));
    expect(mcp.mcpServers.test).toBeDefined();
    dirFilesExactly(join(homeDir, '.claude'), [
      'CLAUDE.md',
      'agents/reviewer.md',
      'commands/review.md',
      'output-styles/review.md',
      'rules/typescript.md',
      'settings.json',
      'skills/test-skill/SKILL.md',
      'skills/test-skill/references/checklist.md',
    ]);
    dirFilesExactly(join(homeDir, '.agents'), [
      'skills/test-skill/SKILL.md',
      'skills/test-skill/references/checklist.md',
    ]);

    rmSync(canonicalDir, { recursive: true, force: true });
    mkdirSync(canonicalDir, { recursive: true });

    const imp = await runCli('import --global --from claude-code', projectDir);
    expect(imp.exitCode).toBe(0);

    fileExists(join(canonicalDir, 'rules', '_root.md'));
    fileContains(join(canonicalDir, 'rules', '_root.md'), 'TypeScript strict mode');
    fileExists(join(canonicalDir, 'rules', 'typescript.md'));
    fileContains(join(canonicalDir, 'rules', 'typescript.md'), 'No any type');
    fileExists(join(canonicalDir, 'commands', 'review.md'));
    fileContains(join(canonicalDir, 'commands', 'review.md'), 'Review code quality');
    fileExists(join(canonicalDir, 'agents', 'reviewer.md'));
    fileContains(join(canonicalDir, 'agents', 'reviewer.md'), 'Review code for quality');
    fileExists(join(canonicalDir, 'skills', 'test-skill', 'SKILL.md'));
    fileExists(join(canonicalDir, 'skills', 'test-skill', 'references', 'checklist.md'));
    fileExists(join(canonicalDir, 'mcp.json'));
    fileExists(join(canonicalDir, 'permissions.yaml'));
    fileExists(join(canonicalDir, 'hooks.yaml'));
    fileExists(join(canonicalDir, 'ignore'));
  });
});
