import { describe, it, expect } from 'vitest';
import {
  buildCompatibilityMatrix,
  formatMatrix,
  formatVerboseDetails,
} from '../../../src/core/matrix/matrix.js';
import type { CanonicalFiles } from '../../../src/core/types.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';
import {
  getTargetCapabilities,
  resolveTargetFeatureGenerator,
} from '../../../src/targets/catalog/builtin-targets.js';

const baseConfig: ValidatedConfig = {
  version: 1,
  targets: [...TARGET_IDS],
  features: ['rules', 'commands', 'agents', 'skills', 'mcp', 'hooks', 'ignore', 'permissions'],
  extends: [],
  overrides: {},
  collaboration: { strategy: 'merge', lock_features: [] },
};

const emptyCanonical: CanonicalFiles = {
  rules: [],
  commands: [],
  agents: [],
  skills: [],
  mcp: null,
  permissions: null,
  hooks: null,
  ignore: [],
};

describe('buildCompatibilityMatrix', () => {
  it('returns rows for enabled features only', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      features: ['rules', 'mcp'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
      mcp: {
        mcpServers: {
          s1: { type: 'stdio', command: 'cmd', args: [], env: {} },
          s2: { type: 'stdio', command: 'cmd2', args: [], env: {} },
        },
      },
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.length).toBe(2);
    expect(rows[0]?.feature).toBe('rules');
    expect(rows[0]?.count).toBe(1);
    expect(rows[1]?.feature).toBe('mcp (2 servers)');
    expect(rows[1]?.count).toBe(2);
  });

  it('includes support levels per target for rules', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['rules'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    const rulesRow = rows.find((r) => r.feature === 'rules');
    expect(rulesRow).toBeDefined();
    expect(rulesRow?.support['claude-code']).toBe('native');
    expect(rulesRow?.support['cursor']).toBe('native');
    expect(rulesRow?.support.continue).toBe('native');
    expect(rulesRow?.support.junie).toBe('native');
    expect(rulesRow?.support.kiro).toBe('native');
    expect(rulesRow?.support['codex-cli']).toBe('native');
  });

  it('includes embedded support levels for additional rules', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['claude-code', 'cursor', 'gemini-cli', 'codex-cli', 'junie', 'antigravity'],
      features: ['rules'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [
        { source: 'root', root: true, targets: [], description: '', globs: [], body: '' },
        {
          source: 'rules/typescript.md',
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TS.',
        },
      ],
    };

    const rows = buildCompatibilityMatrix(config, canonical);
    const additionalRulesRow = rows.find((r) => r.feature === 'additional rules (1)');

    expect(additionalRulesRow).toBeDefined();
    expect(additionalRulesRow?.support['claude-code']).toBe('native');
    expect(additionalRulesRow?.support.cursor).toBe('native');
    expect(additionalRulesRow?.support['gemini-cli']).toBe('embedded');
    expect(additionalRulesRow?.support['codex-cli']).toBe('native');
    expect(additionalRulesRow?.support.junie).toBe('native');
    expect(additionalRulesRow?.support.antigravity).toBe('native');
  });

  it('uses global embedded support levels for additional rules', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['cursor', 'gemini-cli', 'codex-cli', 'junie', 'antigravity'],
      features: ['rules'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [
        { source: 'root', root: true, targets: [], description: '', globs: [], body: '' },
        {
          source: 'rules/typescript.md',
          root: false,
          targets: [],
          description: 'TS rules',
          globs: ['src/**/*.ts'],
          body: 'Use strict TS.',
        },
      ],
    };

    const rows = buildCompatibilityMatrix(config, canonical, 'global');
    const additionalRulesRow = rows.find((r) => r.feature === 'additional rules (1)');

    expect(additionalRulesRow?.support.cursor).toBe('native');
    expect(additionalRulesRow?.support['gemini-cli']).toBe('embedded');
    expect(additionalRulesRow?.support['codex-cli']).toBe('embedded');
    expect(additionalRulesRow?.support.junie).toBe('embedded');
    expect(additionalRulesRow?.support.antigravity).toBe('embedded');
  });

  it('shows permissions as partial for cursor', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['permissions'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: ['Read'], deny: [] },
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    const permRow = rows.find((r) => r.feature.startsWith('permissions'));
    expect(permRow?.support['cursor']).toBe('native');
    expect(permRow?.support['claude-code']).toBe('native');
    expect(permRow?.support['opencode']).toBe('native');
  });

  it('shows continue permissions native at global scope only (project stays none)', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['continue'],
      features: ['permissions'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: ['Read'], deny: [] },
    };
    const projectRows = buildCompatibilityMatrix(config, canonical, 'project');
    const globalRows = buildCompatibilityMatrix(config, canonical, 'global');
    expect(projectRows.find((r) => r.feature.startsWith('permissions'))?.support['continue']).toBe(
      'none',
    );
    expect(globalRows.find((r) => r.feature.startsWith('permissions'))?.support['continue']).toBe(
      'native',
    );
  });

  it('shows augment-code permissions native at both scopes', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['augment-code'],
      features: ['permissions'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: ['view'], deny: [] },
    };
    const projectRows = buildCompatibilityMatrix(config, canonical, 'project');
    const globalRows = buildCompatibilityMatrix(config, canonical, 'global');
    // Augment documents .augment/settings.json `toolPermissions` as repo-level settings
    // committed to the project, with the same shape as ~/.augment/settings.json.
    expect(
      projectRows.find((r) => r.feature.startsWith('permissions'))?.support['augment-code'],
    ).toBe('native');
    expect(
      globalRows.find((r) => r.feature.startsWith('permissions'))?.support['augment-code'],
    ).toBe('native');
  });

  it('shows goose permissions native at global scope (project is partial)', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['goose'],
      features: ['permissions'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: ['Read'], deny: [] },
    };
    const projectRows = buildCompatibilityMatrix(config, canonical, 'project');
    const globalRows = buildCompatibilityMatrix(config, canonical, 'global');
    expect(projectRows.find((r) => r.feature.startsWith('permissions'))?.support['goose']).toBe(
      'partial',
    );
    expect(globalRows.find((r) => r.feature.startsWith('permissions'))?.support['goose']).toBe(
      'native',
    );
  });

  it('shows warp mcp native at both scopes (project and global)', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['warp'],
      features: ['mcp'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      mcp: { mcpServers: { docs: { type: 'stdio', command: 'npx', args: [], env: {} } } },
    };
    const projectRows = buildCompatibilityMatrix(config, canonical, 'project');
    const globalRows = buildCompatibilityMatrix(config, canonical, 'global');
    expect(projectRows.find((r) => r.feature.startsWith('mcp'))?.support['warp']).toBe('native');
    expect(globalRows.find((r) => r.feature.startsWith('mcp'))?.support['warp']).toBe('native');
  });

  it('respects target filter from config', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['claude-code', 'cursor'],
      features: ['rules'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    const rulesRow = rows[0];
    expect(Object.keys(rulesRow?.support ?? {})).toEqual(['claude-code', 'cursor']);
  });

  it('labels features with counts', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['commands', 'skills'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      commands: [
        { source: 'a', name: 'c1', description: '', allowedTools: [], body: '' },
        { source: 'b', name: 'c2', description: '', allowedTools: [], body: '' },
      ],
      skills: [{ source: 's', name: 'sk', description: '', body: '', supportingFiles: [] }],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature.startsWith('commands'))?.feature).toBe('commands (2)');
    expect(rows.find((r) => r.feature.startsWith('skills'))?.feature).toBe('skills (1)');
    expect(rows.find((r) => r.feature.startsWith('commands'))?.support['copilot']).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('commands'))?.support.continue).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('commands'))?.support.junie).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('commands'))?.support.kiro).toBe('embedded');
    expect(rows.find((r) => r.feature.startsWith('skills'))?.support.continue).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('skills'))?.support.junie).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('skills'))?.support.kiro).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('commands'))?.support['codex-cli']).toBe(
      'embedded',
    );
  });

  it('labels commands/agents/skills/mcp/hooks without count when empty', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      features: ['commands', 'agents', 'skills', 'mcp', 'hooks'],
    };
    const canonical: CanonicalFiles = { ...emptyCanonical };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'commands')?.feature).toBe('commands');
    expect(rows.find((r) => r.feature === 'agents')?.feature).toBe('agents');
    expect(rows.find((r) => r.feature === 'skills')?.feature).toBe('skills');
    expect(rows.find((r) => r.feature === 'mcp')?.feature).toBe('mcp');
    expect(rows.find((r) => r.feature === 'hooks')?.feature).toBe('hooks');
  });

  it('reports agents as embedded for gemini-cli, cline, codex-cli, and windsurf', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['agents'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      agents: [
        {
          source: 'a',
          name: 'reviewer',
          description: '',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: '',
        },
      ],
    };
    const row = buildCompatibilityMatrix(config, canonical).find((r) =>
      r.feature.startsWith('agents'),
    );
    expect(row?.support['gemini-cli']).toBe('native');
    expect(row?.support.cline).toBe('native');
    expect(row?.support['codex-cli']).toBe('native');
    expect(row?.support.windsurf).toBe('embedded');
  });

  it('reports disabled skill projections as not supported in the effective matrix', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      features: ['commands', 'agents'],
      conversions: {
        commands_to_skills: { 'codex-cli': false },
        agents_to_skills: { windsurf: false },
      },
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      commands: [{ source: 'cmd', name: 'review', description: '', allowedTools: [], body: '' }],
      agents: [
        {
          source: 'agent',
          name: 'reviewer',
          description: '',
          tools: [],
          disallowedTools: [],
          model: '',
          permissionMode: '',
          maxTurns: 0,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: '',
        },
      ],
    };

    const rows = buildCompatibilityMatrix(config, canonical);
    const commandsRow = rows.find((r) => r.feature.startsWith('commands'));
    const agentsRow = rows.find((r) => r.feature.startsWith('agents'));

    expect(commandsRow?.support['codex-cli']).toBe('none');
    expect(commandsRow?.support.cline).toBe('native');
    expect(agentsRow?.support.windsurf).toBe('none');
    expect(agentsRow?.support['gemini-cli']).toBe('native');
  });

  it('uses global support levels when requested', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['claude-code', 'antigravity', 'cursor', 'codex-cli'],
      features: ['rules', 'skills', 'mcp', 'ignore'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
      skills: [{ source: 's', name: 'review', description: '', body: '', supportingFiles: [] }],
      mcp: { mcpServers: { docs: { type: 'stdio', command: 'npx', args: [], env: {} } } },
      ignore: ['dist'],
    };

    const rows = buildCompatibilityMatrix(config, canonical, 'global');
    const rulesRow = rows.find((row) => row.feature === 'rules');
    const skillsRow = rows.find((row) => row.feature.startsWith('skills'));
    const mcpRow = rows.find((row) => row.feature.startsWith('mcp'));
    const ignoreRow = rows.find((row) => row.feature === 'ignore');

    expect(rulesRow?.support.antigravity).toBe('native');
    expect(rulesRow?.support.cursor).toBe('native');
    expect(skillsRow?.support.cursor).toBe('native');
    expect(mcpRow?.support.antigravity).toBe('native');
    expect(mcpRow?.support.cursor).toBe('native');
    expect(ignoreRow?.support['claude-code']).toBe('native');
  });

  it('hooks with count and partial support', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['hooks'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      hooks: {
        PostToolUse: [{ matcher: 'Write', command: 'prettier $FILE', type: 'command' }],
      },
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature.startsWith('hooks'))?.feature).toBe('hooks (1)');
    expect(rows.find((r) => r.feature.startsWith('hooks'))?.support['gemini-cli']).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('hooks'))?.support['copilot']).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('hooks'))?.support['codex-cli']).toBe('native');
    expect(rows.find((r) => r.feature.startsWith('hooks'))?.support.kiro).toBe('native');
  });

  it('ignore with patterns', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['ignore'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      ignore: ['node_modules', 'dist'],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'ignore')?.count).toBe(1);
  });

  it('permissions with allow and deny', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['permissions'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: ['Read'], deny: ['WebFetch'] },
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature.startsWith('permissions'))?.count).toBe(1);
  });

  it('skips unknown features', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      features: ['rules', 'unknown-feature' as 'rules'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.length).toBe(1);
  });

  it('permissions with empty allow and deny yields count 0', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['permissions'] };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      permissions: { allow: [], deny: [] },
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature.startsWith('permissions'))?.count).toBe(0);
  });

  it('uses plain label when commands count is 0', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['commands'] };
    const canonical: CanonicalFiles = { ...emptyCanonical, commands: [] };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'commands')?.feature).toBe('commands');
    expect(rows.find((r) => r.feature === 'commands')?.count).toBe(0);
  });

  it('uses plain label when agents count is 0', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['agents'] };
    const canonical: CanonicalFiles = { ...emptyCanonical, agents: [] };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'agents')?.feature).toBe('agents');
  });

  it('uses plain label when mcp servers count is 0', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['mcp'] };
    const canonical: CanonicalFiles = { ...emptyCanonical, mcp: { mcpServers: {} } };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'mcp')?.feature).toBe('mcp');
  });

  it('uses plain label when hooks count is 0', () => {
    const config: ValidatedConfig = { ...baseConfig, features: ['hooks'] };
    const canonical: CanonicalFiles = { ...emptyCanonical, hooks: {} };
    const rows = buildCompatibilityMatrix(config, canonical);
    expect(rows.find((r) => r.feature === 'hooks')?.feature).toBe('hooks');
  });

  it('target not in supportMap gets none level', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['claude-code', 'unknown-tool' as 'claude-code'],
      features: ['rules'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      rules: [{ source: 'a', root: true, targets: [], description: '', globs: [], body: '' }],
    };
    const rows = buildCompatibilityMatrix(config, canonical);
    const row = rows.find((r) => r.feature === 'rules');
    expect(row?.support['unknown-tool']).toBe('none');
  });

  it('reports Cline project hooks as native because the target emits hook scripts', () => {
    const config: ValidatedConfig = {
      ...baseConfig,
      targets: ['cline'],
      features: ['hooks'],
    };
    const canonical: CanonicalFiles = {
      ...emptyCanonical,
      hooks: {
        PostToolUse: [{ matcher: 'Edit', command: 'pnpm lint' }],
      },
    };

    expect(resolveTargetFeatureGenerator('cline', 'hooks')).toBeDefined();
    expect(getTargetCapabilities('cline')?.hooks.level).toBe('native');

    const row = buildCompatibilityMatrix(config, canonical).find((r) =>
      r.feature.startsWith('hooks'),
    );
    expect(row?.support.cline).toBe('native');
  });
});

describe('formatVerboseDetails', () => {
  it('formats all feature types when present', () => {
    const canonical: CanonicalFiles = {
      rules: [
        { source: '/p/rules/a.md', root: true, targets: [], description: '', globs: [], body: '' },
      ],
      commands: [
        {
          source: '/p/commands/review.md',
          name: 'review',
          description: '',
          allowedTools: [],
          body: '',
        },
      ],
      agents: [
        {
          source: '/p/agents/cr.md',
          name: 'code-reviewer',
          description: '',
          tools: [],
          disallowedTools: [],
          model: 'sonnet',
          permissionMode: 'default',
          maxTurns: 10,
          mcpServers: [],
          hooks: {},
          skills: [],
          memory: '',
          body: '',
        },
      ],
      skills: [
        {
          source: '/p/skills/api/SKILL.md',
          name: 'api',
          description: '',
          body: '',
          supportingFiles: [],
        },
      ],
      mcp: { mcpServers: { ctx: { type: 'stdio', command: 'npx', args: [], env: {} } } },
      permissions: { allow: ['Read'], deny: [] },
      hooks: { PostToolUse: [{ matcher: 'Write', command: 'prettier', type: 'command' }] },
      ignore: ['node_modules'],
    };
    const out = formatVerboseDetails(canonical);
    expect(out).toContain('rules:');
    expect(out).toContain('commands:');
    expect(out).toContain('agents:');
    expect(out).toContain('skills:');
    expect(out).toContain('mcp:');
    expect(out).toContain('hooks:');
    expect(out).toContain('ignore:');
    expect(out).toContain('permissions:');
  });

  it('returns empty string when canonical empty', () => {
    expect(formatVerboseDetails(emptyCanonical)).toBe('');
  });
});

describe('formatMatrix', () => {
  it('formats rows as transposed table (targets as rows, features as columns)', () => {
    const rows = [
      {
        feature: 'rules',
        count: 1,
        support: { 'claude-code': 'native' as const, cursor: 'native' as const },
      },
    ];
    const out = formatMatrix(rows, ['claude-code', 'cursor']);
    expect(out).toContain('Target');
    expect(out).toContain('Claude');
    expect(out).toContain('cursor');
    expect(out).toContain('Rul');
    expect(out).toMatch(/[✓]/);
  });

  it('includes legend and full-name feature header', () => {
    const rows = [
      {
        feature: 'rules',
        count: 1,
        support: { 'claude-code': 'native' as const },
      },
    ];
    const out = formatMatrix(rows, ['claude-code']);
    expect(out).toContain('native');
    expect(out).toContain('Rules');
  });
});
