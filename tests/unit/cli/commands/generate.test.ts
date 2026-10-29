/**
 * Unit tests for generate command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as tar from 'tar';
import { vi } from 'vitest';
import { runGenerate } from '../../../../src/cli/commands/generate.js';
import { renderGenerate } from '../../../../src/cli/renderers/generate.js';
import { ensurePathInsideRoot } from '../../../../src/cli/commands/generate-path.js';

const TEST_DIR = join(tmpdir(), 'am-generate-unit');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runGenerate', () => {
  it('rejects output paths that escape project root', () => {
    expect(() => ensurePathInsideRoot('/repo', '../outside.txt', 'codex-cli')).toThrow(
      /Unsafe generated output path/i,
    );
  });

  it('accepts output paths under project root', () => {
    // `ensurePathInsideRoot` returns a platform-native path; normalize for the
    // POSIX-style assertion so it works on both Linux/macOS and Windows.
    expect(
      ensurePathInsideRoot('/repo', '.codex/config.toml', 'codex-cli').replace(/\\/g, '/'),
    ).toContain('/repo/.codex/config.toml');
  });

  it('rejects the deprecated --features flag', async () => {
    await expect(runGenerate({ features: 'rules' }, TEST_DIR)).rejects.toThrow(
      /--features is no longer supported/i,
    );
  });

  it('generates Claude global outputs under the user home root when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules, mcp, permissions, ignore, skills, hooks]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Global Root
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'permissions.yaml'),
      `allow:
  - Read(*)
deny:
  - Write(/etc/**)
`,
    );
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'ignore'), 'dist\n');
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'demo'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: Demo skill\n---\nBody.\n',
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'hooks.yaml'),
      `PostToolUse:
  - matcher: "Write"
    command: "echo ok"
    type: command
`,
    );

    const result = await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });
    expect(result.exitCode).toBe(0);

    expect(readFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), 'utf-8')).toContain(
      '# Global Instructions',
    );
    expect(readFileSync(join(TEST_DIR, '.claude', 'CLAUDE.md'), 'utf-8')).toContain(
      '# Global Root',
    );
    expect(readFileSync(join(TEST_DIR, '.claude', 'settings.json'), 'utf-8')).toContain(
      '"permissions"',
    );
    expect(readFileSync(join(TEST_DIR, '.claude.json'), 'utf-8')).toContain('"mcpServers"');
    expect(readFileSync(join(TEST_DIR, '.claude/settings.json'), 'utf-8'))
      .toContain('Read(./dist)');
    // Global hooks belong in ~/.claude/settings.json under `hooks`; Claude Code
    // documents no standalone hooks.json. https://code.claude.com/docs/en/hooks
    expect(existsSync(join(TEST_DIR, '.claude', 'hooks.json'))).toBe(false);
    // permissions and hooks both write settings.json in one pass; the merge base must
    // keep the earlier key rather than clobbering it.
    const globalSettings = JSON.parse(
      readFileSync(join(TEST_DIR, '.claude', 'settings.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(Object.keys(globalSettings).sort()).toEqual(['hooks', 'permissions']);
    expect(globalSettings.hooks).toHaveProperty('PostToolUse');
    expect(existsSync(join(TEST_DIR, '.agents', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(
      readFileSync(join(TEST_DIR, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf-8'),
    ).toContain('name: demo');
  });

  it('does not conflict on ~/.agents/skills when global targets include both claude-code and codex-cli', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code, codex-cli]
features: [rules, skills]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Root
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'senior-frontend'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'senior-frontend', 'SKILL.md'),
      '---\nname: senior-frontend\ndescription: FE\n---\n## Purpose\n\nBody.\n',
    );

    const result = await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, '.claude', 'skills', 'senior-frontend', 'SKILL.md'))).toBe(
      true,
    );
    expect(existsSync(join(TEST_DIR, '.agents', 'skills', 'senior-frontend', 'SKILL.md'))).toBe(
      true,
    );
  });

  it('generates Antigravity global outputs under documented ~/.gemini paths', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'review'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [antigravity]
features: [rules, skills, mcp, commands]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Global Antigravity
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
      `---
description: "TypeScript"
---
Use strict types.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'),
      `---
name: review
description: Review changes
---
Review carefully.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'),
      `---
description: ship
---
ship it
`,
    );

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(readFileSync(join(TEST_DIR, '.gemini', 'GEMINI.md'), 'utf-8')).toContain(
      'Use strict types.',
    );
    expect(
      readFileSync(join(TEST_DIR, '.gemini', 'config', 'skills', 'review', 'SKILL.md'), 'utf-8'),
    ).toContain('Review carefully.');
    expect(readFileSync(join(TEST_DIR, '.gemini', 'config', 'mcp_config.json'), 'utf-8')).toContain(
      '"mcpServers"',
    );
    expect(existsSync(join(TEST_DIR, '.agents', 'workflows', 'ship.md'))).toBe(false);
  });

  it('generates Cursor global ~/.cursor/rules, ~/.cursor/AGENTS.md aggregate, and ~/.cursor tooling paths', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'review'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'agents'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [cursor]
features: [rules, skills, agents, mcp, commands]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Cursor Global
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
      `---
description: "TypeScript"
globs: ["src/**/*.ts"]
---
Use strict types.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'),
      `---
name: review
description: Review changes
---
Review carefully.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
      `---
name: reviewer
description: Reviewer
---
Review carefully.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'),
      `---
description: ship
---
ship it
`,
    );

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(readFileSync(join(TEST_DIR, '.cursor', 'rules', 'general.mdc'), 'utf-8')).toContain(
      'Cursor Global',
    );
    expect(readFileSync(join(TEST_DIR, '.cursor', 'AGENTS.md'), 'utf-8')).toContain(
      'Use strict types.',
    );
    expect(readFileSync(join(TEST_DIR, '.cursor', 'mcp.json'), 'utf-8')).toContain('"mcpServers"');
    expect(
      readFileSync(join(TEST_DIR, '.cursor', 'skills', 'review', 'SKILL.md'), 'utf-8'),
    ).toContain('Review carefully.');
    expect(readFileSync(join(TEST_DIR, '.cursor', 'agents', 'reviewer.md'), 'utf-8')).toContain(
      'Review carefully.',
    );
    expect(readFileSync(join(TEST_DIR, '.cursor', 'commands', 'ship.md'), 'utf-8')).toContain(
      'ship it',
    );
    expect(readFileSync(join(TEST_DIR, '.cursor', 'rules', 'typescript.mdc'), 'utf-8')).toContain(
      'Use strict types.',
    );
  });

  it('generates Codex global outputs under ~/.codex and ~/.agents', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'review'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'agents'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [codex-cli]
features: [rules, commands, skills, agents, mcp]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Codex Global
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'policy.md'),
      `---
description: "Policy"
---
Keep diffs small.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'review', 'SKILL.md'),
      `---
name: review
description: Review changes
---
Review carefully.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
      `---
name: reviewer
description: Reviewer
---
Review carefully.
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { docs: { command: 'npx', args: ['-y', '@docs/mcp'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'commands', 'ship.md'),
      `---
description: ship
---
ship it
`,
    );

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(readFileSync(join(TEST_DIR, '.codex', 'AGENTS.md'), 'utf-8')).toContain(
      'Keep diffs small.',
    );
    expect(readFileSync(join(TEST_DIR, '.codex', 'config.toml'), 'utf-8')).toContain(
      '[mcp_servers.docs]',
    );
    expect(readFileSync(join(TEST_DIR, '.codex', 'agents', 'reviewer.toml'), 'utf-8')).toContain(
      'name = "reviewer"',
    );
    expect(
      readFileSync(join(TEST_DIR, '.agents', 'skills', 'review', 'SKILL.md'), 'utf-8'),
    ).toContain('Review carefully.');
    expect(
      readFileSync(join(TEST_DIR, '.agents', 'skills', 'am-command-ship', 'SKILL.md'), 'utf-8'),
    ).toContain('ship it');
    expect(existsSync(join(TEST_DIR, '.codex', 'instructions', 'policy.md'))).toBe(false);
  });

  it('generates Codex global execution rules into ~/.codex/rules on --global', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [codex-cli]
features: [rules]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Root
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'policy.md'),
      `---
description: "Policy"
codex_emit: execution
---
prefix_rule(
  pattern = ["git", "status"],
  decision = "allow",
)
`,
    );

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(readFileSync(join(TEST_DIR, '.codex', 'rules', 'policy.rules'), 'utf8')).toContain(
      'prefix_rule',
    );
  });

  it('handles no root rule (results.length === 0)', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code, cursor]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'other.md'),
      `---
description: "Other rule"
---
# Other
`,
    );

    await runGenerate({}, TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.claude', 'CLAUDE.md'))).toBe(false);
  });

  it('dry-run logs instead of writing when results exist', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Root
`,
    );

    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runGenerate({ 'dry-run': true }, TEST_DIR);
      renderGenerate(result);
      expect(output).toMatch(/dry-run|created|updated/);
    } finally {
      process.stdout.write = write;
    }
  });

  it('no root rule with dry-run skips writeLock', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'other.md'),
      `---
description: "Other"
---
# Other
`,
    );

    await runGenerate({ 'dry-run': true }, TEST_DIR);
  });

  it('no root rule with extends writes lock with extend checksums', async () => {
    const baseDir = join(TEST_DIR, 'base-no-root');
    mkdirSync(join(baseDir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(baseDir, '.agentsmesh', 'rules', 'lib.md'),
      `---
description: "Lib rules"
globs: ["lib/**/*.ts"]
---
# Lib
`,
    );
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
extends:
  - name: base
    source: ./base-no-root
    features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'only.md'),
      `---
description: "Only"
---
# Only
`,
    );

    await runGenerate({}, TEST_DIR);
    const { readLock } = await import('../../../../src/config/core/lock.js');
    const lock = await readLock(join(TEST_DIR, '.agentsmesh'));
    expect(lock).not.toBeNull();
    expect(lock!.extends).toBeDefined();
  });

  it('logs created/updated summary when files change', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Root
`,
    );
    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result1 = await runGenerate({}, TEST_DIR);
      renderGenerate(result1);
      expect(output).toMatch(/created|updated|unchanged/);
      writeFileSync(
        join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
        `---
root: true
description: "Root"
---
# Root v2
`,
      );
      output = '';
      const result2 = await runGenerate({}, TEST_DIR);
      renderGenerate(result2);
      expect(output).toMatch(/updated|unchanged/);
    } finally {
      process.stdout.write = write;
    }
  });

  it('empty canonical writes lock (results.length === 0 + !dryRun)', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });

    await runGenerate({}, TEST_DIR);

    const { readLock } = await import('../../../../src/config/core/lock.js');
    const lock = await readLock(join(TEST_DIR, '.agentsmesh'));
    expect(lock).not.toBeNull();
  });

  it('empty results with extends writes extend checksums in lock (lines 50-51)', async () => {
    const baseDir = join(TEST_DIR, 'base-mcp');
    mkdirSync(join(baseDir, '.agentsmesh'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [mcp]\nextends:\n  - name: base\n    source: ./base-mcp\n    features: [mcp]\n`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh'), { recursive: true });

    await runGenerate({}, TEST_DIR);

    const { readLock } = await import('../../../../src/config/core/lock.js');
    const lock = await readLock(join(TEST_DIR, '.agentsmesh'));
    expect(lock).not.toBeNull();
    expect(lock!.extends).toBeDefined();
    expect(typeof lock!.extends).toBe('object');
  });

  it('empty canonical with dry-run skips writeLock (results.length === 0 + dryRun)', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });

    await runGenerate({ 'dry-run': true }, TEST_DIR);

    const { readLock } = await import('../../../../src/config/core/lock.js');
    const lock = await readLock(join(TEST_DIR, '.agentsmesh'));
    expect(lock).toBeNull();
  });

  it('check mode succeeds when nothing needs to be generated', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [mcp]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh'), { recursive: true });

    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runGenerate({ check: true }, TEST_DIR);
      expect(result.exitCode).toBe(0);
      renderGenerate(result);
      expect(output).toContain('Generated files are in sync.');
    } finally {
      process.stdout.write = write;
    }
  });

  it('check mode reports drift when generated files would change', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Root
`,
    );

    let output = '';
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runGenerate({ check: true }, TEST_DIR);
      expect(result.exitCode).toBe(1);
      renderGenerate(result);
      expect(output).toContain('[check] created CLAUDE.md (claude-code)');
      expect(output).toContain('Generated files are out of sync.');
    } finally {
      process.stderr.write = write;
    }
  });

  it('global mode prefixes log paths with ~/ so users cannot mistake them for project writes', async () => {
    // The rootBase for scope='global' is homedir(), so writes go to ~/<path>.
    // The log must reflect that — a raw `.claude/settings.json` looks project-local.
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---\nroot: true\ndescription: "Root"\n---\n# Root\n`,
    );

    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });
      expect(result.exitCode).toBe(0);
      renderGenerate(result);
      expect(output).toMatch(/created ~\/\.claude\/CLAUDE\.md/);
      expect(output).not.toMatch(/(?<!~\/)\.claude\/CLAUDE\.md/);
    } finally {
      process.stdout.write = write;
    }
  });

  it('project mode logs paths without the ~/ prefix', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---\nroot: true\ndescription: "Root"\n---\n# Root\n`,
    );

    let output = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    };
    try {
      const result = await runGenerate({}, TEST_DIR, { printMatrix: false });
      expect(result.exitCode).toBe(0);
      renderGenerate(result);
      expect(output).toMatch(/created CLAUDE\.md/);
      expect(output).not.toMatch(/~\/.*CLAUDE\.md/);
    } finally {
      process.stdout.write = write;
    }
  });

  it('unchanged summary skips "Generated:" log when all files unchanged', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1\ntargets: [claude-code]\nfeatures: [rules]\n`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---\nroot: true\ndescription: "Root"\n---\n# Root\n`,
    );

    await runGenerate({}, TEST_DIR);

    const logs: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    };
    try {
      const result = await runGenerate({}, TEST_DIR);
      renderGenerate(result);
      const output = logs.join('');
      expect(output).not.toContain('Generated:');
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it('filters to no targets when targets flag matches none', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code, cursor]
features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Root
`,
    );
    await expect(runGenerate({ targets: 'nonexistent-target' }, TEST_DIR)).rejects.toThrow(
      /Unknown target\(s\) in --targets/,
    );
  });

  it('writes lock with extend checksums when extends present', async () => {
    const baseDir = join(TEST_DIR, 'base-config');
    mkdirSync(join(baseDir, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(baseDir, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Base"
---
# Base
`,
    );

    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
extends:
  - name: base
    source: ./base-config
    features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Local"
---
# Local
`,
    );

    await runGenerate({}, TEST_DIR);
    const { readLock } = await import('../../../../src/config/core/lock.js');
    const lock = await readLock(join(TEST_DIR, '.agentsmesh'));
    expect(lock).not.toBeNull();
    expect(lock!.extends).toBeDefined();
    expect(typeof lock!.extends).toBe('object');
  });

  it('refreshes cached remote extends when --refresh-cache is used', async () => {
    const cacheDir = join(TEST_DIR, 'cache');
    const staleRulesDir = join(
      cacheDir,
      'org-refresh-v1_0_0',
      'org-refresh-v1.0.0',
      '.agentsmesh',
      'rules',
    );
    mkdirSync(staleRulesDir, { recursive: true });
    writeFileSync(join(staleRulesDir, '_root.md'), '---\nroot: true\n---\n# Stale cache\n');

    const srcDir = join(TEST_DIR, 'remote-src');
    const freshRulesDir = join(srcDir, 'org-refresh-v1.0.0', '.agentsmesh', 'rules');
    mkdirSync(freshRulesDir, { recursive: true });
    writeFileSync(join(freshRulesDir, '_root.md'), '---\nroot: true\n---\n# Fresh cache\n');

    const tarball = join(TEST_DIR, 'refresh.tar.gz');
    await tar.c({ file: tarball, gzip: true, cwd: srcDir }, ['org-refresh-v1.0.0']);
    const tarballBytes = readFileSync(tarball);
    const ab = new ArrayBuffer(tarballBytes.length);
    new Uint8Array(ab).set(new Uint8Array(tarballBytes));

    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
extends:
  - name: remote-base
    source: github:org/refresh@v1.0.0
    features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });

    const oldCacheEnv = process.env.AGENTSMESH_CACHE;
    process.env.AGENTSMESH_CACHE = cacheDir;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(ab),
      }),
    );

    try {
      await runGenerate({ 'refresh-cache': true }, TEST_DIR, { printMatrix: false });
      expect(readFileSync(join(TEST_DIR, 'CLAUDE.md'), 'utf-8')).toContain('Fresh cache');
    } finally {
      process.env.AGENTSMESH_CACHE = oldCacheEnv;
      vi.unstubAllGlobals();
    }
  });

  it('rejects locked-feature changes for collaboration.strategy=lock unless --force is used', async () => {
    writeFileSync(
      join(TEST_DIR, 'agentsmesh.yaml'),
      `version: 1
targets: [claude-code]
features: [rules]
collaboration:
  strategy: lock
  lock_features: [rules]
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
---
# Locked rules changed
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', '.lock'),
      `generated_at: "2026-03-22T10:00:00Z"
generated_by: test
lib_version: "0.1.0"
checksums:
  rules/_root.md: "sha256:${'0'.repeat(64)}"
extends: {}
packs: {}
`,
    );

    await expect(runGenerate({}, TEST_DIR, { printMatrix: false })).rejects.toThrow(
      /Locked feature violation/i,
    );

    const result = await runGenerate({ force: true }, TEST_DIR, { printMatrix: false });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, 'CLAUDE.md'))).toBe(true);
  });

  it('generates Copilot global outputs under the user home root when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [copilot]
features: [rules, commands, agents, skills]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Global Root
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'commands'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'commands', 'test.md'),
      `---
name: test
description: Test command
---
Test body
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
      `---
name: reviewer
description: Code reviewer
---
Review code carefully
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'demo'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: Demo skill\n---\nBody.\n',
    );

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(existsSync(join(TEST_DIR, '.copilot', 'copilot-instructions.md'))).toBe(true);
    // Copilot CLI has no prompt-file/slash-command mechanism — no global commands surface.
    expect(existsSync(join(TEST_DIR, '.copilot', 'prompts', 'test.prompt.md'))).toBe(false);
    expect(existsSync(join(TEST_DIR, '.copilot', 'agents', 'reviewer.agent.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.copilot', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agents', 'skills', 'demo', 'SKILL.md'))).toBe(true);
  });

  it('generates Kiro global outputs under the user home root when --global is set', async () => {
    vi.stubEnv('HOME', TEST_DIR);
    vi.stubEnv('USERPROFILE', TEST_DIR);

    mkdirSync(join(TEST_DIR, '.agentsmesh', 'rules'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agentsmesh.yaml'),
      `version: 1
targets: [kiro]
features: [rules, agents, skills, mcp, ignore]
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
      `---
root: true
description: "Root"
---
# Global Root
`,
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
      `---
description: "TypeScript rules"
---
Use strict mode
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'agents'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'agents', 'reviewer.md'),
      `---
name: reviewer
description: Code reviewer
---
Review code carefully
`,
    );
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'skills', 'demo'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: Demo skill\n---\nBody.\n',
    );
    writeFileSync(
      join(TEST_DIR, '.agentsmesh', 'mcp.json'),
      JSON.stringify({ mcpServers: { test: { command: 'test' } } }, null, 2),
    );
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'ignore'), 'node_modules\n*.log\n');

    await runGenerate({ global: true }, TEST_DIR, { printMatrix: false });

    expect(existsSync(join(TEST_DIR, '.kiro', 'steering', 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.kiro', 'steering', 'typescript.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.kiro', 'agents', 'reviewer.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.kiro', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.kiro', 'settings', 'mcp.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.kiro', 'settings', 'kiroignore'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.agents', 'skills', 'demo', 'SKILL.md'))).toBe(true);
  });
});
