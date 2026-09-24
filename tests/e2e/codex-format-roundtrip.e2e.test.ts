import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, createTestProject } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { fileContains, fileExists, dirTreeExactly, readText } from './helpers/assertions.js';

function writeCanonicalCodexFixture(dir: string): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  mkdirSync(join(dir, '.agentsmesh', 'commands'), { recursive: true });
  mkdirSync(join(dir, '.agentsmesh', 'agents'), { recursive: true });
  mkdirSync(join(dir, '.agentsmesh', 'skills', 'release-checklist', 'scripts'), {
    recursive: true,
  });
  mkdirSync(join(dir, '.agentsmesh', 'skills', 'release-checklist', 'references'), {
    recursive: true,
  });
  mkdirSync(join(dir, '.agentsmesh', 'skills', 'release-checklist', 'assets'), {
    recursive: true,
  });
  mkdirSync(join(dir, '.agentsmesh', 'skills', 'bug-triage'), { recursive: true });

  writeFileSync(
    join(dir, 'agentsmesh.yaml'),
    `version: 1
targets: [codex-cli]
features: [rules, commands, agents, skills, mcp]
`,
  );

  writeFileSync(
    join(dir, '.agentsmesh', 'rules', '_root.md'),
    `---
root: true
description: Root guidance
---
# Repository expectations

- Use pnpm
`,
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'typescript.md'),
    `---
description: TypeScript standards
globs:
  - "src/**/*.ts"
---
# TypeScript Standards

- Use strict mode
`,
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'payments.md'),
    `---
description: Payments service rules
globs:
  - "services/payments/**"
codex_instruction: override
---
# Payments service rules

- Use make test-payments
`,
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'rules', 'default.md'),
    `---
description: Command guardrails
codex_emit: execution
---
prefix_rule(
  pattern = ["git", "status"],
  decision = "allow",
  justification = "Allow safe status checks",
)
`,
  );

  writeFileSync(
    join(dir, '.agentsmesh', 'commands', 'review.md'),
    `---
description: Review changes
allowed-tools: [Read, Bash(git diff)]
---
Review current changes.
`,
  );

  writeFileSync(
    join(dir, '.agentsmesh', 'agents', 'reviewer.md'),
    `---
description: PR reviewer
model: gpt-5-codex
permission-mode: read-only
---
Review code carefully.
`,
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'agents', 'pr-explorer.md'),
    `---
description: PR explorer
model: gpt-5.3-codex-spark
permission-mode: read-only
---
Summarize pull requests.
`,
  );

  writeFileSync(
    join(dir, '.agentsmesh', 'skills', 'release-checklist', 'SKILL.md'),
    `---
description: Release checklist helper
---
Run release checklist.
`,
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'skills', 'release-checklist', 'scripts', 'validate.sh'),
    '#!/usr/bin/env bash\necho validate\n',
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'skills', 'release-checklist', 'references', 'release-notes.md'),
    '# Release Notes\n',
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'skills', 'release-checklist', 'assets', 'changelog-template.md'),
    '# Changelog Template\n',
  );
  writeFileSync(
    join(dir, '.agentsmesh', 'skills', 'bug-triage', 'SKILL.md'),
    `---
description: Bug triage helper
---
Triage incoming bugs.
`,
  );

  writeFileSync(
    join(dir, '.agentsmesh', 'mcp.json'),
    `{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {}
    }
  }
}
`,
  );
}

describe('codex-cli format contract roundtrip', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('generates codex-cli files in documented format and round-trips back to canonical', async () => {
    dir = createTestProject();
    writeCanonicalCodexFixture(dir);

    const generateResult = await runCli('generate --targets codex-cli', dir);
    expect(generateResult.exitCode, generateResult.stderr).toBe(0);

    fileContains(join(dir, 'AGENTS.md'), '# Repository expectations');
    fileContains(join(dir, 'src', 'AGENTS.md'), '# TypeScript Standards');
    fileContains(
      join(dir, 'services', 'payments', 'AGENTS.override.md'),
      '# Payments service rules',
    );

    fileContains(join(dir, '.codex', 'rules', 'default.rules'), 'prefix_rule(');
    fileContains(join(dir, '.codex', 'rules', 'default.rules'), 'decision = "allow"');

    fileContains(join(dir, '.codex', 'config.toml'), '[mcp_servers.context7]');
    fileContains(join(dir, '.codex', 'config.toml'), 'command = "npx"');

    fileContains(join(dir, '.codex', 'agents', 'reviewer.toml'), 'name = "reviewer"');
    fileContains(join(dir, '.codex', 'agents', 'reviewer.toml'), 'developer_instructions =');
    fileContains(join(dir, '.codex', 'agents', 'pr-explorer.toml'), 'name = "pr-explorer"');

    fileContains(
      join(dir, '.agents', 'skills', 'release-checklist', 'SKILL.md'),
      'name: release-checklist',
    );
    fileContains(
      join(dir, '.agents', 'skills', 'release-checklist', 'SKILL.md'),
      'description: Release checklist helper',
    );
    dirTreeExactly(join(dir, '.agents', 'skills', 'release-checklist'), [
      'SKILL.md',
      'assets/',
      'assets/changelog-template.md',
      'references/',
      'references/release-notes.md',
      'scripts/',
      'scripts/validate.sh',
    ]);
    fileContains(join(dir, '.agents', 'skills', 'bug-triage', 'SKILL.md'), 'name: bug-triage');

    rmSync(join(dir, '.agentsmesh'), { recursive: true, force: true });

    const importResult = await runCli('import --from codex-cli', dir);
    expect(importResult.exitCode, importResult.stderr).toBe(0);

    fileContains(join(dir, '.agentsmesh', 'rules', '_root.md'), 'root: true');
    // Nested AGENTS.md files carry an embedded-rule entry per rule, so each
    // rule returns to its own canonical file with its own globs (#140).
    fileContains(join(dir, '.agentsmesh', 'rules', 'typescript.md'), '  - src/**/*.ts');
    fileContains(join(dir, '.agentsmesh', 'rules', 'payments.md'), 'codex_instruction: override');
    fileContains(join(dir, '.agentsmesh', 'rules', 'payments.md'), '  - services/payments/**');
    expect(existsSync(join(dir, '.agentsmesh', 'rules', 'src.md'))).toBe(false);
    expect(existsSync(join(dir, '.agentsmesh', 'rules', 'services-payments.md'))).toBe(false);
    fileContains(join(dir, '.agentsmesh', 'rules', 'default.md'), 'codex_emit: execution');
    fileContains(join(dir, '.agentsmesh', 'rules', 'default.md'), 'prefix_rule(');

    fileExists(join(dir, '.agentsmesh', 'commands', 'review.md'));
    fileContains(join(dir, '.agentsmesh', 'agents', 'reviewer.md'), 'name: reviewer');
    fileContains(join(dir, '.agentsmesh', 'agents', 'pr-explorer.md'), 'name: pr-explorer');
    fileContains(
      join(dir, '.agentsmesh', 'skills', 'release-checklist', 'SKILL.md'),
      'Run release checklist.',
    );
    fileExists(join(dir, '.agentsmesh', 'skills', 'release-checklist', 'scripts', 'validate.sh'));
    fileExists(
      join(dir, '.agentsmesh', 'skills', 'release-checklist', 'references', 'release-notes.md'),
    );
    fileExists(
      join(dir, '.agentsmesh', 'skills', 'release-checklist', 'assets', 'changelog-template.md'),
    );
    fileExists(join(dir, '.agentsmesh', 'skills', 'bug-triage', 'SKILL.md'));

    const mcp = readText(join(dir, '.agentsmesh', 'mcp.json'));
    expect(mcp).toContain('"context7"');
    expect(mcp).toContain('"command": "npx"');
  });
});
