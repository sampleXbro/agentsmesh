import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestProject, cleanup } from './helpers/setup.js';
import { runCli } from './helpers/run-cli.js';
import { readJson, fileNotExists } from './helpers/assertions.js';

function writeProject(dir: string, target: string, features: string[]): void {
  mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
  writeFileSync(
    join(dir, 'agentsmesh.yaml'),
    `version: 1\ntargets: [${target}]\nfeatures: [rules, ${features.join(', ')}]\n`,
  );
  writeFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
}

describe('partial capability subset contracts', () => {
  let dir = '';

  afterEach(() => {
    if (dir) cleanup(dir);
    dir = '';
  });

  it('generates .cursor/cli.json for Cursor permissions (native capability, no partial warning)', async () => {
    dir = createTestProject();
    writeProject(dir, 'cursor', ['permissions']);
    writeFileSync(
      join(dir, '.agentsmesh', 'permissions.yaml'),
      'allow:\n  - Read\n  - Bash(npm run test:*)\ndeny:\n  - Read(./.env)\n  - Bash(curl:*)\n',
    );

    expect((await runCli('generate --targets cursor', dir)).exitCode).toBe(0);
    // Permissions are native — written to .cursor/cli.json, not .cursor/permissions.json
    fileNotExists(join(dir, '.cursor', 'permissions.json'));
    const cliJson = readJson(join(dir, '.cursor', 'cli.json'));
    expect(cliJson['permissions']).toEqual({
      allow: ['Read', 'Bash(npm run test:*)'],
      deny: ['Read(./.env)', 'Bash(curl:*)'],
    });

    // Native capability — no stale partial-fidelity warning
    const lintResult = await runCli('lint --targets cursor', dir);
    expect(lintResult.stdout + lintResult.stderr).not.toContain(
      'Cursor permissions are partial; tool-level allow/deny may lose fidelity.',
    );
  });

  it('keeps only supported Gemini hook events and warns for unsupported ones', async () => {
    dir = createTestProject();
    writeProject(dir, 'gemini-cli', ['hooks']);
    writeFileSync(
      join(dir, '.agentsmesh', 'hooks.yaml'),
      [
        'PreToolUse:',
        '  - matcher: Bash',
        '    command: echo pre',
        'PostToolUse:',
        '  - matcher: Write',
        '    command: echo post',
        'Notification:',
        '  - matcher: ".*"',
        '    command: echo notify',
        'SubagentStart:',
        '  - matcher: ".*"',
        '    command: echo start',
        'SessionEnd:',
        '  - matcher: ".*"',
        '    command: echo end',
        '',
      ].join('\n'),
    );

    expect((await runCli('generate --targets gemini-cli', dir)).exitCode).toBe(0);
    const settings = readJson(join(dir, '.gemini', 'settings.json'));
    expect(settings['hooks']).toEqual({
      // Gemini matches its own tool names: Bash -> run_shell_command, Write -> write_file.
      BeforeTool: [
        {
          matcher: '^(?:run_shell_command)$',
          hooks: [{ name: 'BeforeTool-1', type: 'command', command: 'echo pre' }],
        },
      ],
      AfterTool: [
        {
          matcher: '^(?:write_file)$',
          hooks: [{ name: 'AfterTool-1', type: 'command', command: 'echo post' }],
        },
      ],
      Notification: [
        {
          matcher: '.*',
          hooks: [{ name: 'Notification-1', type: 'command', command: 'echo notify' }],
        },
      ],
      BeforeAgent: [
        {
          matcher: '.*',
          hooks: [{ name: 'BeforeAgent-1', type: 'command', command: 'echo start' }],
        },
      ],
    });

    const lintResult = await runCli('lint --targets gemini-cli', dir);
    expect(lintResult.stdout + lintResult.stderr).toContain(
      'SessionEnd is not supported by gemini-cli; only PreToolUse, PostToolUse, Notification, UserPromptSubmit, SubagentStart, SubagentStop, and SessionStart are projected.',
    );
  });

  it('emits partial-capability warnings for all 5 jules partial features', async () => {
    dir = createTestProject();
    mkdirSync(join(dir, '.agentsmesh', 'rules'), { recursive: true });
    mkdirSync(join(dir, '.agentsmesh', 'commands'), { recursive: true });
    writeFileSync(
      join(dir, 'agentsmesh.yaml'),
      'version: 1\ntargets: [jules]\nfeatures: [rules, commands, mcp, hooks, ignore, permissions]\n',
    );
    writeFileSync(join(dir, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n# Root\n');
    writeFileSync(
      join(dir, '.agentsmesh', 'commands', 'review.md'),
      '---\ndescription: Review code\n---\nReview the diff.',
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, '.agentsmesh', 'hooks.yaml'),
      'PreToolUse:\n  - matcher: Bash\n    command: echo pre\n',
    );
    writeFileSync(join(dir, '.agentsmesh', 'ignore'), 'node_modules\n.env\n');
    writeFileSync(
      join(dir, '.agentsmesh', 'permissions.yaml'),
      'allow:\n  - Bash\ndeny:\n  - Read(./.env)\n',
    );

    expect((await runCli('generate --targets jules', dir)).exitCode).toBe(0);

    const lintResult = await runCli('lint --targets jules', dir);
    const output = lintResult.stdout + lintResult.stderr;

    expect(output).toContain('Jules has no command system; canonical commands are not projected.');
    expect(output).toContain(
      'Jules is a cloud-based agent with no MCP support; canonical MCP servers are not projected.',
    );
    expect(output).toContain(
      'Jules has no lifecycle hook system; canonical hooks are not projected.',
    );
    expect(output).toContain(
      'Jules is a cloud-based agent with no dedicated ignore file; canonical ignore patterns are not projected.',
    );
    expect(output).toContain(
      'Jules has no permissions system; canonical permissions are not projected.',
    );
  });

  it('keeps exact Windsurf and Copilot partial subsets with deterministic warnings', async () => {
    dir = createTestProject();
    writeProject(dir, 'windsurf', ['mcp']);
    writeFileSync(
      join(dir, '.agentsmesh', 'mcp.json'),
      JSON.stringify(
        { mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } } },
        null,
        2,
      ),
    );

    expect((await runCli('generate --targets windsurf', dir)).exitCode).toBe(0);
    expect(readJson(join(dir, '.windsurf', 'mcp_config.example.json'))).toEqual({
      mcpServers: {
        context7: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          env: {},
        },
      },
    });

    const windsurfLint = await runCli('lint --targets windsurf', dir);
    expect(windsurfLint.stdout + windsurfLint.stderr).toContain(
      'Windsurf MCP is partial; generated .windsurf/mcp_config.example.json is a reference artifact and may require manual setup.',
    );

    writeProject(dir, 'copilot', ['hooks']);
    writeFileSync(
      join(dir, '.agentsmesh', 'hooks.yaml'),
      [
        'PreToolUse:',
        '  - matcher: Bash',
        '    command: echo pre',
        'SubagentStop:',
        '  - matcher: ".*"',
        '    command: echo stop',
        '',
      ].join('\n'),
    );

    expect((await runCli('generate --targets copilot', dir)).exitCode).toBe(0);
    expect(readJson(join(dir, '.github', 'hooks', 'agentsmesh.json'))).toEqual({
      version: 1,
      hooks: {
        preToolUse: [{ type: 'command', bash: './scripts/pretooluse-0.sh', matcher: 'Bash' }],
      },
    });

    const copilotLint = await runCli('lint --targets copilot', dir);
    expect(copilotLint.stdout + copilotLint.stderr).toContain(
      'SubagentStop is not supported by Copilot hooks; only PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit, and SessionStart are projected.',
    );
  });
});
