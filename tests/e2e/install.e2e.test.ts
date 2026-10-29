/**
 * E2E: agentsmesh install (dist/cli.js).
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from './helpers/run-cli.js';

describe('install e2e', () => {
  it('install --sync with no manifest returns clean no-op message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-sync-empty-'));
    try {
      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,skills]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const synced = await runCli('install --sync --force', proj);
      expect(synced.exitCode, synced.stderr).toBe(0);
      expect(synced.stdout + synced.stderr).toContain(
        'No recorded installs found in .agentsmesh/installs.yaml.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dry-run leaves extends unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-'));
    try {
      mkdirSync(join(dir, 'up', 'skills', 's1'), { recursive: true });
      writeFileSync(
        join(dir, 'up', 'skills', 's1', 'SKILL.md'),
        '---\ndescription: d\n---\n# S1\n',
      );
      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills]\nextends: []\n',
      );
      writeFileSync(join(proj, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n');

      const skillPath = join(dir, 'up', 'skills', 's1');
      const r = await runCli(`install ${skillPath} --dry-run`, proj);
      expect(r.exitCode, r.stderr).toBe(0);
      expect(readFileSync(join(proj, 'agentsmesh.yaml'), 'utf8')).toContain('extends: []');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dry-run with --target and --path writes gemini-cli target into preview JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-target-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, '.gemini', 'commands'), { recursive: true });
      writeFileSync(
        join(upstream, '.gemini', 'commands', 'demo.toml'),
        'description = "Demo"\nprompt = "Run"\n',
      );
      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules, commands]\nextends: []\n',
      );
      writeFileSync(join(proj, '.agentsmesh', 'rules', '_root.md'), '---\nroot: true\n---\n');

      const r = await runCli(
        `install ${upstream} --dry-run --force --extends --target gemini-cli --path .gemini/commands`,
        proj,
      );
      expect(r.exitCode, r.stderr).toBe(0);
      expect(r.stdout).toContain('"target"');
      expect(r.stdout).toContain('gemini-cli');
      expect(r.stdout).toContain('.gemini/commands');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('default install materializes a pack and generates artifacts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-pack-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, '.agentsmesh', 'skills', 'demo'), { recursive: true });
      writeFileSync(
        join(upstream, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
        '---\ndescription: Demo\n---\n# Demo\n',
      );
      writeFileSync(
        join(upstream, '.agentsmesh', 'mcp.json'),
        JSON.stringify({ mcpServers: { context7: { command: 'npx', args: ['-y', 'ctx'] } } }),
      );
      writeFileSync(join(upstream, '.agentsmesh', 'ignore'), 'node_modules\ndist\n');

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,skills,mcp,ignore]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const r = await runCli(`install ${upstream} --force --name shared-pack`, proj);
      expect(r.exitCode, r.stderr).toBe(0);
      expect(r.stdout).not.toContain('Legend:');
      expect(
        readFileSync(join(proj, '.agentsmesh', 'packs', 'shared-pack', 'ignore'), 'utf8'),
      ).toContain('node_modules');
      expect(readFileSync(join(proj, '.mcp.json'), 'utf8')).toContain('context7');
      expect(readFileSync(join(proj, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain(
        '# Demo',
      );
      expect(readFileSync(join(proj, '.claude/settings.json'), 'utf8')).toContain('Read(./dist)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non-dry-run --extends writes extends entry to config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-extends-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, '.agentsmesh', 'skills', 'demo'), { recursive: true });
      writeFileSync(
        join(upstream, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
        '---\ndescription: Demo\n---\n# Demo\n',
      );

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,skills]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const r = await runCli(`install ${upstream} --force --extends --name ext-pack`, proj);
      expect(r.exitCode, r.stderr).toBe(0);
      const yaml = readFileSync(join(proj, 'agentsmesh.yaml'), 'utf8');
      expect(yaml).toContain('name: ext-pack');
      expect(yaml).toContain('features:');
      expect(yaml).toContain('skills');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non-dry-run --extends preserves --as and generates flat markdown collections', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-extends-as-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, 'workflows'), { recursive: true });
      writeFileSync(
        join(upstream, 'workflows', 'review.md'),
        '---\ndescription: Review\n---\nReview changes.\n',
      );

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,commands]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const r = await runCli(
        `install ${upstream} --force --extends --as commands --path workflows --name workflow-commands`,
        proj,
      );
      expect(r.exitCode, r.stderr).toBe(0);
      const yaml = readFileSync(join(proj, 'agentsmesh.yaml'), 'utf8');
      expect(yaml).toContain('name: workflow-commands');
      expect(yaml).toContain('as: commands');
      expect(readFileSync(join(proj, '.claude', 'commands', 'review.md'), 'utf8')).toContain(
        'Review changes.',
      );

      const generated = await runCli('generate --targets claude-code', proj);
      expect(generated.exitCode, generated.stderr).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('manual --as agents installs a generic markdown folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-manual-as-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, 'agents', 'universal'), { recursive: true });
      writeFileSync(
        join(upstream, 'agents', 'universal', 'api-architect.md'),
        '---\ndescription: API architect\ntools: Read, Write\n---\n\nDesign APIs.\n',
      );

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,agents]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const r = await runCli(
        `install ${upstream} --force --as agents --path agents/universal --name universal-agents`,
        proj,
      );
      expect(r.exitCode, r.stderr).toBe(0);
      expect(readFileSync(join(proj, '.claude', 'agents', 'api-architect.md'), 'utf8')).toContain(
        'Design APIs.',
      );
      expect(readFileSync(join(proj, '.agentsmesh', 'installs.yaml'), 'utf8')).toContain(
        'as: agents',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['skills', 'api-generator', '.claude/skills/api-generator/SKILL.md', '# API Generator'],
    ['rules', 'typescript', '.claude/rules/typescript.md', 'Follow standards.'],
    ['commands', 'review', '.claude/commands/review.md', 'Review current changes'],
  ] as const)(
    'manual --as %s installs and generates expected output',
    async (kind, itemName, generatedPath, expectedText) => {
      const dir = mkdtempSync(join(tmpdir(), `am-e2e-install-manual-${kind}-`));
      try {
        const upstream = join(dir, 'up');
        if (kind === 'skills') {
          mkdirSync(join(upstream, 'skills', itemName), { recursive: true });
          writeFileSync(
            join(upstream, 'skills', itemName, 'SKILL.md'),
            '---\ndescription: Generate APIs\n---\n# API Generator\n',
          );
        } else if (kind === 'rules') {
          mkdirSync(join(upstream, 'rules'), { recursive: true });
          writeFileSync(
            join(upstream, 'rules', 'typescript.md'),
            '---\ndescription: TypeScript\n---\n# Rules\nFollow standards.\n',
          );
        } else {
          mkdirSync(join(upstream, 'commands'), { recursive: true });
          writeFileSync(
            join(upstream, 'commands', 'review.md'),
            '---\ndescription: Code review\n---\nReview current changes\n',
          );
        }

        const proj = join(dir, 'proj');
        mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
        writeFileSync(
          join(proj, 'agentsmesh.yaml'),
          `version: 1\ntargets: [claude-code]\nfeatures: [rules,${kind}]\nextends: []\n`,
        );
        writeFileSync(
          join(proj, '.agentsmesh', 'rules', '_root.md'),
          '---\nroot: true\n---\n# Root\n',
        );

        const r = await runCli(
          `install ${upstream} --force --as ${kind} --path ${kind} --name scoped-${kind}`,
          proj,
        );
        expect(r.exitCode, r.stderr).toBe(0);

        expect(readFileSync(join(proj, generatedPath), 'utf8')).toContain(expectedText);
        expect(readFileSync(join(proj, '.agentsmesh', 'installs.yaml'), 'utf8')).toContain(
          `as: ${kind}`,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('install --sync restores deleted packs from the manifest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-sync-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, '.agentsmesh', 'skills', 'demo'), { recursive: true });
      writeFileSync(
        join(upstream, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
        '---\ndescription: Demo\n---\n# Demo\n',
      );

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules,skills]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const initial = await runCli(`install ${upstream} --force --name shared-pack`, proj);
      expect(initial.exitCode, initial.stderr).toBe(0);
      rmSync(join(proj, '.agentsmesh', 'packs'), { recursive: true, force: true });

      const synced = await runCli('install --sync --force', proj);
      expect(synced.exitCode, synced.stderr).toBe(0);
      expect(
        readFileSync(join(proj, '.agentsmesh', 'packs', 'shared-pack', 'pack.yaml'), 'utf8'),
      ).toContain('name: shared-pack');
      expect(readFileSync(join(proj, '.claude', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain(
        '# Demo',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--global installs into ~/.agentsmesh/packs and regenerates user-level outputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-global-'));
    try {
      const upstream = join(dir, 'up');
      mkdirSync(join(upstream, '.agentsmesh', 'skills', 'demo'), { recursive: true });
      writeFileSync(
        join(upstream, '.agentsmesh', 'skills', 'demo', 'SKILL.md'),
        '---\ndescription: Demo\n---\n# Demo\n',
      );

      const fakeHome = join(dir, 'home');
      const globalCanonical = join(fakeHome, '.agentsmesh');
      mkdirSync(join(globalCanonical, 'rules'), { recursive: true });
      writeFileSync(
        join(globalCanonical, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills]\nextends: []\n',
      );
      writeFileSync(
        join(globalCanonical, 'rules', '_root.md'),
        '---\nroot: true\n---\n# Global root\n',
      );

      const r = await runCli(`install ${upstream} --force --global --name global-pack`, dir, {
        HOME: fakeHome,
      });
      expect(r.exitCode, r.stderr).toBe(0);
      // Pack lives under ~/.agentsmesh/packs, not the project.
      expect(
        readFileSync(
          join(fakeHome, '.agentsmesh', 'packs', 'global-pack', 'skills', 'demo', 'SKILL.md'),
          'utf-8',
        ),
      ).toContain('# Demo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--all installs every sub-pack from a marketplace.json source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-e2e-install-all-'));
    try {
      const upstream = join(dir, 'marketplace');
      // Two sub-packs at plugins/alpha and plugins/beta — each a canonical
      // agentsmesh layout with a single skill.
      mkdirSync(join(upstream, '.claude-plugin'), { recursive: true });
      writeFileSync(
        join(upstream, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({
          plugins: [{ source: 'plugins/alpha' }, { source: 'plugins/beta' }],
        }),
      );
      for (const name of ['alpha', 'beta']) {
        mkdirSync(join(upstream, 'plugins', name, '.agentsmesh', 'skills', `skill-${name}`), {
          recursive: true,
        });
        writeFileSync(
          join(upstream, 'plugins', name, '.agentsmesh', 'skills', `skill-${name}`, 'SKILL.md'),
          `---\ndescription: ${name}\n---\n# ${name}\n`,
        );
      }

      const proj = join(dir, 'proj');
      mkdirSync(join(proj, '.agentsmesh', 'rules'), { recursive: true });
      writeFileSync(
        join(proj, 'agentsmesh.yaml'),
        'version: 1\ntargets: [claude-code]\nfeatures: [rules, skills]\nextends: []\n',
      );
      writeFileSync(
        join(proj, '.agentsmesh', 'rules', '_root.md'),
        '---\nroot: true\n---\n# Root\n',
      );

      const r = await runCli(`install ${upstream} --force --all`, proj);
      expect(r.exitCode, r.stderr).toBe(0);

      // --all fans out across every sub-pack; both skills must land in the
      // generated outputs regardless of how the pack writer chose to bundle
      // them on disk (one shared pack for a single source, distinct packs
      // for separate sources).
      expect(
        readFileSync(join(proj, '.claude', 'skills', 'skill-alpha', 'SKILL.md'), 'utf-8'),
      ).toContain('alpha');
      expect(
        readFileSync(join(proj, '.claude', 'skills', 'skill-beta', 'SKILL.md'), 'utf-8'),
      ).toContain('beta');
      // installs.yaml records both sub-pack paths from the marketplace.
      const installsYaml = readFileSync(join(proj, '.agentsmesh', 'installs.yaml'), 'utf-8');
      expect(installsYaml).toContain('plugins/alpha');
      expect(installsYaml).toContain('plugins/beta');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
