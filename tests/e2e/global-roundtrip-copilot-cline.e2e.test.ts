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

describe('global mode round-trip: Copilot', () => {
  const env = useGlobalEnv();

  it('canonical → generate --global → import --global → matches canonical', async () => {
    const { homeDir, canonicalDir, projectDir } = env;
    mkdirSync(join(canonicalDir, 'rules'), { recursive: true });
    mkdirSync(join(canonicalDir, 'agents'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'copilot-skill'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'copilot-skill', 'references'), { recursive: true });

    writeFileSync(
      join(canonicalDir, 'rules', '_root.md'),
      '---\ndescription: Root\n---\n# Root\nCopilot instructions\n',
    );
    writeFileSync(
      join(canonicalDir, 'agents', 'explainer.md'),
      '---\ndescription: Explainer\n---\n# Explainer\nExplain code\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'copilot-skill', 'SKILL.md'),
      '---\ndescription: Skill\n---\n# Skill\nHelps with Copilot\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'copilot-skill', 'references', 'guide.md'),
      '# Guide\nExplain clearly.\n',
    );
    writeFileSync(
      join(canonicalDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'npx', args: ['-y'] } } }),
    );
    writeFileSync(
      join(canonicalDir, 'hooks.yaml'),
      'PreToolUse:\n  - matcher: Bash\n    command: echo hi\n',
    );
    writeFileSync(
      join(canonicalDir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [copilot]\nfeatures: [rules, agents, skills, mcp, hooks]\n',
    );

    const gen = await runCli('generate --global --targets copilot', projectDir);
    expect(gen.exitCode).toBe(0);

    // 1. Global instructions (docs: ~/.copilot/copilot-instructions.md)
    fileExists(join(homeDir, '.copilot', 'copilot-instructions.md'));
    fileContains(join(homeDir, '.copilot', 'copilot-instructions.md'), 'Copilot instructions');
    markdownHasNoFrontmatter(join(homeDir, '.copilot', 'copilot-instructions.md'));

    // 2. Agents (docs: ~/.copilot/agents/*.agent.md)
    fileExists(join(homeDir, '.copilot', 'agents', 'explainer.agent.md'));
    fileContains(join(homeDir, '.copilot', 'agents', 'explainer.agent.md'), 'Explain code');
    expect(
      markdownFrontmatter(join(homeDir, '.copilot', 'agents', 'explainer.agent.md')).name,
    ).toBe('explainer');

    // 3. Skills primary (docs: ~/.copilot/skills/<skill>/SKILL.md)
    fileExists(join(homeDir, '.copilot', 'skills', 'copilot-skill', 'SKILL.md'));
    fileContains(
      join(homeDir, '.copilot', 'skills', 'copilot-skill', 'SKILL.md'),
      'Helps with Copilot',
    );
    expect(
      markdownFrontmatter(join(homeDir, '.copilot', 'skills', 'copilot-skill', 'SKILL.md')).name,
    ).toBe('copilot-skill');
    fileExists(join(homeDir, '.copilot', 'skills', 'copilot-skill', 'references', 'guide.md'));

    // 4. Skills mirror (docs: ~/.agents/skills/ — COPILOT_GLOBAL_AGENTS_SKILLS_DIR)
    fileExists(join(homeDir, '.agents', 'skills', 'copilot-skill', 'SKILL.md'));
    fileContains(
      join(homeDir, '.agents', 'skills', 'copilot-skill', 'SKILL.md'),
      'Helps with Copilot',
    );
    fileExists(join(homeDir, '.agents', 'skills', 'copilot-skill', 'references', 'guide.md'));

    // 5. AGENTS.md compat mirror (docs: ~/.copilot/AGENTS.md)
    fileExists(join(homeDir, '.copilot', 'AGENTS.md'));
    fileContains(join(homeDir, '.copilot', 'AGENTS.md'), 'Copilot instructions');

    // 6. .claude/skills mirror (docs: ~/.claude/skills/ — COPILOT_GLOBAL_CLAUDE_SKILLS_DIR)
    fileExists(join(homeDir, '.claude', 'skills', 'copilot-skill', 'SKILL.md'));
    fileContains(
      join(homeDir, '.claude', 'skills', 'copilot-skill', 'SKILL.md'),
      'Helps with Copilot',
    );
    fileExists(join(homeDir, '.claude', 'skills', 'copilot-skill', 'references', 'guide.md'));

    // 7. No commands surface (Copilot CLI has no prompt-file/slash-command mechanism)
    fileNotExists(join(homeDir, '.copilot', 'prompts'));

    // 8. MCP (docs: ~/.copilot/mcp-config.json, `mcpServers` key)
    fileExists(join(homeDir, '.copilot', 'mcp-config.json'));
    validJson(join(homeDir, '.copilot', 'mcp-config.json'));
    const mcp = JSON.parse(readText(join(homeDir, '.copilot', 'mcp-config.json')));
    expect(mcp.mcpServers.docs).toBeDefined();
    expect(mcp.servers).toBeUndefined();

    // 9. Hooks (docs: ~/.copilot/hooks/*.json — same schema as project scope)
    fileExists(join(homeDir, '.copilot', 'hooks', 'agentsmesh.json'));
    const hooks = JSON.parse(readText(join(homeDir, '.copilot', 'hooks', 'agentsmesh.json')));
    expect(hooks.hooks.preToolUse[0].matcher).toBe('Bash');
    fileExists(join(homeDir, '.copilot', 'hooks', 'scripts', 'pretooluse-0.sh'));
    fileContains(join(homeDir, '.copilot', 'hooks', 'scripts', 'pretooluse-0.sh'), 'echo hi');

    dirFilesExactly(join(homeDir, '.copilot'), [
      'AGENTS.md',
      'agents/explainer.agent.md',
      'copilot-instructions.md',
      'hooks/agentsmesh.json',
      'hooks/scripts/pretooluse-0.sh',
      'mcp-config.json',
      'skills/copilot-skill/SKILL.md',
      'skills/copilot-skill/references/guide.md',
    ]);
    dirFilesExactly(join(homeDir, '.agents'), [
      'skills/copilot-skill/SKILL.md',
      'skills/copilot-skill/references/guide.md',
    ]);
    dirFilesExactly(join(homeDir, '.claude'), [
      'skills/copilot-skill/SKILL.md',
      'skills/copilot-skill/references/guide.md',
    ]);

    rmSync(canonicalDir, { recursive: true, force: true });
    mkdirSync(canonicalDir, { recursive: true });

    const imp = await runCli('import --global --from copilot', projectDir);
    expect(imp.exitCode).toBe(0);

    fileExists(join(canonicalDir, 'rules', '_root.md'));
    fileContains(join(canonicalDir, 'rules', '_root.md'), 'Copilot instructions');
    fileExists(join(canonicalDir, 'agents', 'explainer.md'));
    fileContains(join(canonicalDir, 'agents', 'explainer.md'), 'Explain code');
    fileExists(join(canonicalDir, 'skills', 'copilot-skill', 'SKILL.md'));
    fileContains(join(canonicalDir, 'skills', 'copilot-skill', 'SKILL.md'), 'Helps with Copilot');
    fileExists(join(canonicalDir, 'skills', 'copilot-skill', 'references', 'guide.md'));
    fileExists(join(canonicalDir, 'mcp.json'));
    const importedMcp = JSON.parse(readText(join(canonicalDir, 'mcp.json')));
    expect(importedMcp.mcpServers.docs).toBeDefined();
    fileExists(join(canonicalDir, 'hooks.yaml'));
    fileContains(join(canonicalDir, 'hooks.yaml'), 'Bash');
    fileContains(join(canonicalDir, 'hooks.yaml'), 'echo hi');
  });
});

describe('global mode round-trip: Cline', () => {
  const env = useGlobalEnv();

  it('canonical → generate --global → import --global → matches canonical', async () => {
    const { homeDir, canonicalDir, projectDir } = env;
    mkdirSync(join(canonicalDir, 'rules'), { recursive: true });
    mkdirSync(join(canonicalDir, 'commands'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'cline-skill'), { recursive: true });
    mkdirSync(join(canonicalDir, 'skills', 'cline-skill', 'references'), { recursive: true });

    writeFileSync(
      join(canonicalDir, 'rules', '_root.md'),
      '---\ndescription: Root\n---\n# Root\nCline rules\n',
    );
    writeFileSync(
      join(canonicalDir, 'rules', 'python.md'),
      '---\ndescription: Python\nglobs: ["**/*.py"]\n---\n# Python\nUse type hints\n',
    );
    writeFileSync(
      join(canonicalDir, 'commands', 'review.md'),
      '---\ndescription: Review\n---\n# Review\nReview code\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'cline-skill', 'SKILL.md'),
      '---\ndescription: Cline skill\n---\n# Cline Skill\nCline helper\n',
    );
    writeFileSync(
      join(canonicalDir, 'skills', 'cline-skill', 'references', 'workflow.md'),
      '# Workflow\nReview carefully.\n',
    );
    writeFileSync(
      join(canonicalDir, 'mcp.json'),
      '{"mcpServers":{"test":{"command":"node","args":[]}}}',
    );
    writeFileSync(join(canonicalDir, 'ignore'), 'node_modules\n');
    writeFileSync(
      join(canonicalDir, 'hooks.yaml'),
      'PreToolUse:\n  - matcher: ".*"\n    type: command\n    command: echo hook\n',
    );
    writeFileSync(
      join(canonicalDir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [cline]\nfeatures: [rules, commands, skills, mcp, ignore, hooks]\n',
    );

    const gen = await runCli('generate --global --targets cline', projectDir);
    expect(gen.exitCode).toBe(0);

    // 1. Rules (CLI docs: ~/.cline/data/settings/rules/)
    fileExists(join(homeDir, '.cline', 'data', 'settings', 'rules', 'python.md'));
    fileContains(
      join(homeDir, '.cline', 'data', 'settings', 'rules', 'python.md'),
      'Use type hints',
    );
    expect(
      markdownFrontmatter(join(homeDir, '.cline', 'data', 'settings', 'rules', 'python.md'))
        .description,
    ).toBe('Python');

    // 2. Workflows/commands (docs: ~/Documents/Cline/Workflows/ — unaffected by this fix)
    fileExists(join(homeDir, 'Documents', 'Cline', 'Workflows', 'review.md'));
    fileContains(join(homeDir, 'Documents', 'Cline', 'Workflows', 'review.md'), 'Review code');
    markdownHasNoFrontmatter(join(homeDir, 'Documents', 'Cline', 'Workflows', 'review.md'));

    // 3. Skills (CLI docs: ~/.cline/data/settings/skills/<skill>/SKILL.md)
    fileExists(join(homeDir, '.cline', 'data', 'settings', 'skills', 'cline-skill', 'SKILL.md'));
    fileContains(
      join(homeDir, '.cline', 'data', 'settings', 'skills', 'cline-skill', 'SKILL.md'),
      'Cline helper',
    );
    expect(
      markdownFrontmatter(
        join(homeDir, '.cline', 'data', 'settings', 'skills', 'cline-skill', 'SKILL.md'),
      ).name,
    ).toBe('cline-skill');
    fileExists(
      join(
        homeDir,
        '.cline',
        'data',
        'settings',
        'skills',
        'cline-skill',
        'references',
        'workflow.md',
      ),
    );

    // 4. Skills mirror (docs: ~/.agents/skills/)
    fileExists(join(homeDir, '.agents', 'skills', 'cline-skill', 'SKILL.md'));
    fileExists(join(homeDir, '.agents', 'skills', 'cline-skill', 'references', 'workflow.md'));

    // 5. MCP: no documented global MCP surface (CLI docs) — not generated at global scope.
    fileNotExists(join(homeDir, '.cline', 'mcp.json'));

    // 6. Ignore: no documented global ignore surface (docs.cline.bot/customization/clineignore)
    // — not generated at global scope.
    fileNotExists(join(homeDir, '.clineignore'));

    // 7. Hooks (CLI docs: ~/.cline/hooks — same relative path as project scope)
    fileExists(join(homeDir, '.cline', 'hooks', 'pretooluse-0.sh'));
    fileContains(join(homeDir, '.cline', 'hooks', 'pretooluse-0.sh'), 'echo hook');
    fileContains(join(homeDir, '.cline', 'hooks', 'pretooluse-0.sh'), '#!/usr/bin/env bash');
    dirFilesExactly(join(homeDir, 'Documents', 'Cline'), ['Workflows/review.md']);
    dirFilesExactly(join(homeDir, '.cline'), [
      'data/settings/rules/python.md',
      'data/settings/skills/cline-skill/SKILL.md',
      'data/settings/skills/cline-skill/references/workflow.md',
      'hooks/pretooluse-0.sh',
    ]);

    // The root rule is never written at global scope (AGENTS.md is suppressed there,
    // and there is no alternative root-rule destination) — write it directly into the
    // real global rules dir so the import round-trip below can recover it, mirroring
    // what a real Cline user's ~/.cline/data/settings/rules/_root.md would contain.
    writeFileSync(
      join(homeDir, '.cline', 'data', 'settings', 'rules', '_root.md'),
      readText(join(canonicalDir, 'rules', '_root.md')),
    );

    rmSync(canonicalDir, { recursive: true, force: true });
    mkdirSync(canonicalDir, { recursive: true });

    const imp = await runCli('import --global --from cline', projectDir);
    expect(imp.exitCode).toBe(0);

    fileExists(join(canonicalDir, 'rules', '_root.md'));
    fileContains(join(canonicalDir, 'rules', '_root.md'), 'Cline rules');
    fileExists(join(canonicalDir, 'rules', 'python.md'));
    fileContains(join(canonicalDir, 'rules', 'python.md'), 'Use type hints');
    fileExists(join(canonicalDir, 'skills', 'cline-skill', 'SKILL.md'));
    fileExists(join(canonicalDir, 'skills', 'cline-skill', 'references', 'workflow.md'));
    // MCP and ignore are project-only surfaces — cline's own import doesn't populate
    // them at global scope, and the agentsmesh MCP server is seeded on project imports only.
    fileNotExists(join(canonicalDir, 'mcp.json'));
    fileNotExists(join(canonicalDir, 'ignore'));
    // Hooks are emitted globally under ~/.cline/hooks/; Cline import does not read them back yet.
  });
});
