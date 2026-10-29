import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './helpers/run-cli.js';
import {
  fileExists,
  fileNotExists,
  fileContains,
  readText,
  validJson,
  dirFilesExactly,
} from './helpers/assertions.js';
import { markdownFrontmatter, markdownHasNoFrontmatter } from './helpers/file-shape.js';
import { useGlobalEnv } from './helpers/global-roundtrip-setup.js';

describe('global mode round-trip: Cursor', () => {
  const env = useGlobalEnv();

  it('canonical → generate --global → import --global → matches canonical', async () => {
    const { homeDir, canonicalDir, projectDir } = env;
    mkdirSync(join(canonicalDir, 'rules'), { recursive: true });
    mkdirSync(join(canonicalDir, 'commands'), { recursive: true });
    mkdirSync(join(canonicalDir, 'agents'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'cursor-skill'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'cursor-skill', 'references'), { recursive: true });

    writeFileSync(
      join(canonicalDir, 'rules', '_root.md'),
      '---\ndescription: Root\n---\n# Root\nUse strict types\n',
    );
    writeFileSync(
      join(canonicalDir, 'rules', 'testing.md'),
      '---\ndescription: Testing\nglobs: ["**/*.test.ts"]\n---\n# Testing\nWrite comprehensive tests\n',
    );
    writeFileSync(
      join(canonicalDir, 'commands', 'lint.md'),
      '---\ndescription: Lint\n---\n# Lint\nRun the linter\n',
    );
    writeFileSync(
      join(canonicalDir, 'agents', 'tester.md'),
      '---\ndescription: Test agent\n---\n# Tester\nRun tests\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'cursor-skill', 'SKILL.md'),
      '---\ndescription: Cursor skill\n---\n# Cursor Skill\nHelps with Cursor\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'cursor-skill', 'references', 'playbook.md'),
      '# Playbook\nKeep tests crisp.\n',
    );
    writeFileSync(
      join(canonicalDir, 'mcp.json'),
      '{"mcpServers":{"test":{"command":"node","args":[]}}}',
    );
    writeFileSync(
      join(canonicalDir, 'hooks.yaml'),
      'PreToolUse:\n  - matcher: ".*"\n    type: command\n    command: echo test\n',
    );
    writeFileSync(join(canonicalDir, 'ignore'), 'tmp/\n');
    writeFileSync(
      join(canonicalDir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [cursor]\nfeatures: [rules, commands, agents, skills, mcp, hooks, ignore]\n',
    );

    const gen = await runCli('generate --global --targets cursor', projectDir);
    expect(gen.exitCode).toBe(0);

    // 1. Rules (docs: ~/.cursor/rules/general.mdc and named rules)
    fileExists(join(homeDir, '.cursor', 'rules', 'general.mdc'));
    fileContains(join(homeDir, '.cursor', 'rules', 'general.mdc'), 'Use strict types');
    expect(markdownFrontmatter(join(homeDir, '.cursor', 'rules', 'general.mdc')).alwaysApply).toBe(
      true,
    );
    fileExists(join(homeDir, '.cursor', 'rules', 'testing.mdc'));
    fileContains(join(homeDir, '.cursor', 'rules', 'testing.mdc'), 'Write comprehensive tests');
    expect(markdownFrontmatter(join(homeDir, '.cursor', 'rules', 'testing.mdc')).description).toBe(
      'Testing',
    );

    // 2. AGENTS.md compatibility (docs: ~/.cursor/AGENTS.md — outputFamilies)
    fileExists(join(homeDir, '.cursor', 'AGENTS.md'));
    fileContains(join(homeDir, '.cursor', 'AGENTS.md'), 'Use strict types');
    markdownHasNoFrontmatter(join(homeDir, '.cursor', 'AGENTS.md'));

    // 3. Skills primary (docs: ~/.cursor/skills/<skill>/SKILL.md)
    fileExists(join(homeDir, '.cursor', 'skills', 'cursor-skill', 'SKILL.md'));
    fileContains(
      join(homeDir, '.cursor', 'skills', 'cursor-skill', 'SKILL.md'),
      'Helps with Cursor',
    );
    expect(
      markdownFrontmatter(join(homeDir, '.cursor', 'skills', 'cursor-skill', 'SKILL.md')).name,
    ).toBe('cursor-skill');
    fileExists(join(homeDir, '.cursor', 'skills', 'cursor-skill', 'references', 'playbook.md'));

    // 4. Skills mirror (docs: ~/.agents/skills/)
    fileExists(join(homeDir, '.agents', 'skills', 'cursor-skill', 'SKILL.md'));
    fileExists(join(homeDir, '.agents', 'skills', 'cursor-skill', 'references', 'playbook.md'));

    // 5. Commands (docs: ~/.cursor/commands/*.md)
    fileExists(join(homeDir, '.cursor', 'commands', 'lint.md'));
    fileContains(join(homeDir, '.cursor', 'commands', 'lint.md'), 'Run the linter');
    // Cursor command files carry the canonical description as frontmatter.
    expect(markdownFrontmatter(join(homeDir, '.cursor', 'commands', 'lint.md'))).toHaveProperty(
      'description',
    );

    // 6. Agents (docs: ~/.cursor/agents/*.md)
    fileExists(join(homeDir, '.cursor', 'agents', 'tester.md'));
    fileContains(join(homeDir, '.cursor', 'agents', 'tester.md'), 'Run tests');
    expect(markdownFrontmatter(join(homeDir, '.cursor', 'agents', 'tester.md')).name).toBe(
      'tester',
    );

    // 7. Hooks (docs: ~/.cursor/hooks.json)
    fileExists(join(homeDir, '.cursor', 'hooks.json'));
    validJson(join(homeDir, '.cursor', 'hooks.json'));
    const cursorHooks = JSON.parse(readText(join(homeDir, '.cursor', 'hooks.json'))) as {
      hooks?: { preToolUse?: unknown };
    };
    expect(cursorHooks.hooks?.preToolUse).toBeDefined();

    // 8. MCP (docs: ~/.cursor/mcp.json)
    fileExists(join(homeDir, '.cursor', 'mcp.json'));
    validJson(join(homeDir, '.cursor', 'mcp.json'));
    const mcp = JSON.parse(readText(join(homeDir, '.cursor', 'mcp.json')));
    expect(mcp.mcpServers.test).toBeDefined();

    // Global ignore is an IDE-only setting, not a ~/.cursorignore file.
    fileNotExists(join(homeDir, '.cursorignore'));
    dirFilesExactly(join(homeDir, '.cursor'), [
      'AGENTS.md',
      'agents/tester.md',
      'commands/lint.md',
      'hooks.json',
      'mcp.json',
      'rules/general.mdc',
      'rules/testing.mdc',
      'skills/cursor-skill/SKILL.md',
      'skills/cursor-skill/references/playbook.md',
    ]);
    dirFilesExactly(join(homeDir, '.agents'), [
      'skills/cursor-skill/SKILL.md',
      'skills/cursor-skill/references/playbook.md',
    ]);

    rmSync(canonicalDir, { recursive: true, force: true });
    mkdirSync(canonicalDir, { recursive: true });

    const imp = await runCli('import --global --from cursor', projectDir);
    expect(imp.exitCode).toBe(0);

    fileExists(join(canonicalDir, 'rules', '_root.md'));
    fileContains(join(canonicalDir, 'rules', '_root.md'), 'Use strict types');
    fileExists(join(canonicalDir, 'rules', 'testing.md'));
    fileExists(join(canonicalDir, 'commands', 'lint.md'));
    fileContains(join(canonicalDir, 'commands', 'lint.md'), 'Run the linter');
    fileExists(join(canonicalDir, 'agents', 'tester.md'));
    fileExists(join(canonicalDir, 'skills', 'cursor-skill', 'SKILL.md'));
    fileExists(join(canonicalDir, 'skills', 'cursor-skill', 'references', 'playbook.md'));
    fileExists(join(canonicalDir, 'mcp.json'));
    fileExists(join(canonicalDir, 'hooks.yaml'));
    fileNotExists(join(canonicalDir, 'ignore'));
  });
});
