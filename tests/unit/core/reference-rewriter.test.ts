import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import type { CanonicalFiles, GenerateResult } from '../../../src/core/types.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';

const mockBuildArtifactPathMap = vi.hoisted(() => vi.fn());

vi.mock('../../../src/core/reference/output-source-map.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/core/reference/output-source-map.js')>();
  return {
    ...actual,
    buildArtifactPathMap: (
      ...args: Parameters<typeof actual.buildArtifactPathMap>
    ): ReturnType<typeof actual.buildArtifactPathMap> => {
      mockBuildArtifactPathMap(...args);
      return actual.buildArtifactPathMap(...args);
    },
  };
});

import { rewriteGeneratedReferences } from '../../../src/core/reference/rewriter.js';
import { resolveOutputCollisions } from '../../../src/core/generate/collision.js';

function makeConfig(targets: ValidatedConfig['targets']): ValidatedConfig {
  return {
    version: 1,
    targets,
    features: ['rules', 'commands', 'agents', 'skills'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  };
}

function makeCanonical(projectRoot: string): CanonicalFiles {
  return {
    rules: [
      {
        source: join(projectRoot, '.agentsmesh', 'rules', '_root.md'),
        root: true,
        targets: [],
        description: '',
        globs: [],
        body: '',
      },
      {
        source: join(projectRoot, '.agentsmesh', 'rules', 'typescript.md'),
        root: false,
        targets: [],
        description: '',
        globs: ['src/**/*.ts'],
        body: '',
      },
    ],
    commands: [
      {
        source: join(projectRoot, '.agentsmesh', 'commands', 'review.md'),
        name: 'review',
        description: '',
        allowedTools: [],
        body: '',
      },
    ],
    agents: [
      {
        source: join(projectRoot, '.agentsmesh', 'agents', 'reviewer.md'),
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
    skills: [
      {
        source: join(projectRoot, '.agentsmesh', 'skills', 'api-gen', 'SKILL.md'),
        name: 'api-gen',
        description: '',
        body: '',
        supportingFiles: [
          {
            relativePath: 'references/checklist.md',
            absolutePath: join(
              projectRoot,
              '.agentsmesh',
              'skills',
              'api-gen',
              'references',
              'checklist.md',
            ),
            content: '',
          },
        ],
      },
    ],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

describe('rewriteGeneratedReferences', () => {
  it('rewrites root and nested artifact links to project-root paths', () => {
    const projectRoot = '/proj';
    const results: GenerateResult[] = [
      {
        target: 'claude-code',
        path: '.claude/CLAUDE.md',
        content:
          'See .agentsmesh/rules/typescript.md, .agentsmesh/commands/review.md, .agentsmesh/agents/reviewer.md, and .agentsmesh/skills/api-gen/references/checklist.md.',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/commands/review.md',
        content: 'Load .agentsmesh/skills/api-gen/SKILL.md.',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/rules/typescript.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/agents/reviewer.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(projectRoot),
      makeConfig(['claude-code']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toContain('rules/typescript.md');
    expect(rewritten[0]!.content).toContain('commands/review.md');
    expect(rewritten[0]!.content).toContain('agents/reviewer.md');
    expect(rewritten[0]!.content).toContain('skills/api-gen/references/checklist.md');
    expect(rewritten[1]!.content).toContain('../skills/api-gen/SKILL.md');
  });

  it('rewrites canonical markdown destinations to Claude global paths', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'claude-code',
        path: '.claude/CLAUDE.md',
        content:
          'See [rule](.agentsmesh/rules/typescript.md) and [checklist](.agentsmesh/skills/api-gen/references/checklist.md).',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/rules/typescript.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(join(homeRoot, '.agentsmesh')),
      makeConfig(['claude-code']),
      homeRoot,
      'global',
    );

    expect(rewritten[0]!.content).toContain('[rule](./rules/typescript.md)');
    expect(rewritten[0]!.content).toContain(
      '[checklist](./skills/api-gen/references/checklist.md)',
    );
  });

  it('rewrites target-native prose links to the current Claude global target surface', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/SKILL.md',
        content: 'Read `.codex/skills/api-gen/references/checklist.md`.',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(homeRoot),
      makeConfig(['claude-code']),
      homeRoot,
      'global',
    );

    expect(rewritten[0]!.content).toBe('Read `./references/checklist.md`.');
  });

  it('rewrites canonical markdown destinations to Antigravity global paths', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'antigravity',
        path: '.gemini/GEMINI.md',
        content: 'See [checklist](.agentsmesh/skills/api-gen/references/checklist.md).',
        status: 'created',
      },
      {
        target: 'antigravity',
        path: '.gemini/config/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'antigravity',
        path: '.gemini/config/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(join(homeRoot, '.agentsmesh')),
      makeConfig(['antigravity']),
      homeRoot,
      'global',
    );

    expect(rewritten[0]!.content).toContain(
      '[checklist](./config/skills/api-gen/references/checklist.md)',
    );
  });

  it('rewrites canonical markdown destinations to Cursor global paths', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'cursor',
        path: '.cursor/rules/general.mdc',
        content:
          'See [agent](.agentsmesh/agents/reviewer.md) and [checklist](.agentsmesh/skills/api-gen/references/checklist.md).',
        status: 'created',
      },
      {
        target: 'cursor',
        path: '.cursor/agents/reviewer.md',
        content: '',
        status: 'created',
      },
      {
        target: 'cursor',
        path: '.cursor/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'cursor',
        path: '.cursor/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(join(homeRoot, '.agentsmesh')),
      makeConfig(['cursor']),
      homeRoot,
      'global',
    );

    expect(rewritten[0]!.content).toContain('[agent](../agents/reviewer.md)');
    expect(rewritten[0]!.content).toContain(
      '[checklist](../skills/api-gen/references/checklist.md)',
    );
  });

  it('rewrites canonical markdown destinations to Codex global paths', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'codex-cli',
        path: '.codex/AGENTS.md',
        content: 'See [skill](.agentsmesh/skills/api-gen/SKILL.md).',
        status: 'created',
      },
      {
        target: 'codex-cli',
        path: '.agents/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(join(homeRoot, '.agentsmesh')),
      makeConfig(['codex-cli']),
      homeRoot,
      'global',
    );

    expect(rewritten[0]!.content).toContain('[skill](../.agents/skills/api-gen/SKILL.md)');
  });

  it('preserves canonical prose anchors when generation runs in global scope', () => {
    const homeRoot = '/home/tester';
    const results: GenerateResult[] = [
      {
        target: 'cursor',
        path: '.cursor/rules/general.mdc',
        content:
          'See .agentsmesh/agents/reviewer.md and .agentsmesh/skills/api-gen/references/checklist.md.',
        status: 'created',
      },
      {
        target: 'cursor',
        path: '.cursor/agents/reviewer.md',
        content: '',
        status: 'created',
      },
      {
        target: 'cursor',
        path: '.cursor/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      makeCanonical(join(homeRoot, '.agentsmesh')),
      makeConfig(['cursor']),
      homeRoot,
      'global',
    );

    // Canonical anchors project to the colocated cursor counterparts.
    expect(rewritten[0]!.content).toContain('.cursor/agents/reviewer.md');
    expect(rewritten[0]!.content).toContain('.cursor/skills/api-gen/references/checklist.md');
  });

  it('aligns Cline .agents/skills mirror rewrites with codex-cli when both targets are active (global)', () => {
    const homeRoot = '/home/tester';
    const canonical = makeCanonical(homeRoot);
    const skill = canonical.skills[0]!;
    skill.supportingFiles.push({
      relativePath: 'scripts/frontend_scaffolder.py',
      absolutePath: join(
        homeRoot,
        '.agentsmesh',
        'skills',
        'api-gen',
        'scripts',
        'frontend_scaffolder.py',
      ),
      content: '# See .agentsmesh/skills/api-gen/SKILL.md for setup.\n',
    });

    const sharedPath = '.agents/skills/api-gen/scripts/frontend_scaffolder.py';
    const results: GenerateResult[] = [
      {
        target: 'codex-cli',
        path: sharedPath,
        content: skill.supportingFiles[1]!.content,
        status: 'created',
      },
      {
        target: 'cline',
        path: '.cline/skills/api-gen/scripts/frontend_scaffolder.py',
        content: skill.supportingFiles[1]!.content,
        status: 'created',
      },
      {
        target: 'cline',
        path: sharedPath,
        content: skill.supportingFiles[1]!.content,
        status: 'created',
      },
      {
        target: 'codex-cli',
        path: '.agents/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'cline',
        path: '.cline/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
    ];

    const activeTargets = ['codex-cli', 'cline'] as const;
    const rewritten = rewriteGeneratedReferences(
      results,
      canonical,
      makeConfig([...activeTargets]),
      homeRoot,
      'global',
      activeTargets,
    );

    const codex = rewritten.find((r) => r.target === 'codex-cli' && r.path === sharedPath);
    const clineMirror = rewritten.find((r) => r.target === 'cline' && r.path === sharedPath);
    expect(codex?.content).toBe(clineMirror?.content);
    expect(() => resolveOutputCollisions(rewritten)).not.toThrow();
  });

  it('rewrites references to root-embedded codex rules (no directory glob) to AGENTS.md', () => {
    const projectRoot = '/proj';
    const canonical = makeCanonical(projectRoot);
    canonical.rules[1] = { ...canonical.rules[1]!, globs: [] };

    const rewritten = rewriteGeneratedReferences(
      [
        {
          target: 'codex-cli',
          path: 'AGENTS.md',
          content: 'See .agentsmesh/rules/typescript.md.',
          status: 'created',
        },
      ],
      canonical,
      makeConfig(['codex-cli']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toBe('See AGENTS.md.');
  });

  it('skips outputs that have no canonical text source mapping', () => {
    const rewritten = rewriteGeneratedReferences(
      [
        {
          target: 'cursor',
          path: '.cursor/mcp.json',
          content: '{"note":".agentsmesh/commands/review.md"}',
          status: 'created',
        },
      ],
      makeCanonical('/proj'),
      makeConfig(['cursor']),
      '/proj',
    );

    expect(rewritten[0]!.content).toBe('{"note":".agentsmesh/commands/review.md"}');
  });

  it('rewrites Copilot .github/instructions rule outputs from their canonical rule source', () => {
    const projectRoot = '/proj';
    const canonical = makeCanonical(projectRoot);
    canonical.rules[1] = {
      ...canonical.rules[1]!,
      body: 'See .agentsmesh/rules/typescript.md.',
    };
    const results: GenerateResult[] = [
      {
        target: 'copilot',
        path: '.github/instructions/typescript.instructions.md',
        content: 'See .agentsmesh/rules/typescript.md.',
        status: 'created',
      },
      {
        target: 'copilot',
        path: '.github/copilot-instructions.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      canonical,
      makeConfig(['copilot']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toContain('./typescript.instructions.md');
  });

  it('rewrites absolute canonical paths through the generated artifact map', () => {
    const projectRoot = '/proj';
    const rewritten = rewriteGeneratedReferences(
      [
        {
          target: 'claude-code',
          path: 'CLAUDE.md',
          content:
            'Absolute: /proj/.agentsmesh/rules/typescript.md, /proj/.agentsmesh/commands/review.md, /proj/.agentsmesh/skills/api-gen/references/checklist.md.',
          status: 'created',
        },
        {
          target: 'claude-code',
          path: '.claude/rules/typescript.md',
          content: '',
          status: 'created',
        },
        {
          target: 'claude-code',
          path: '.claude/commands/review.md',
          content: '',
          status: 'created',
        },
        {
          target: 'claude-code',
          path: '.claude/skills/api-gen/SKILL.md',
          content: '',
          status: 'created',
        },
        {
          target: 'claude-code',
          path: '.claude/skills/api-gen/references/checklist.md',
          content: '',
          status: 'created',
        },
      ],
      makeCanonical(projectRoot),
      makeConfig(['claude-code']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toBe(
      'Absolute: .claude/rules/typescript.md, .claude/commands/review.md, .claude/skills/api-gen/references/checklist.md.',
    );
  });

  it('rewrites windsurf root AGENTS and scoped rule outputs from their canonical rule sources', () => {
    const projectRoot = '/proj';
    const canonical = makeCanonical(projectRoot);
    const results: GenerateResult[] = [
      {
        target: 'windsurf',
        path: 'AGENTS.md',
        content: 'Use .agentsmesh/skills/api-gen/ and .agentsmesh/skills/api-gen/references/.',
        status: 'created',
      },
      {
        target: 'windsurf',
        path: '.windsurf/rules/typescript.md',
        content: 'Use .agentsmesh/skills/api-gen/SKILL.md.',
        status: 'created',
      },
      {
        target: 'windsurf',
        path: '.windsurf/skills/api-gen/SKILL.md',
        content: '',
        status: 'created',
      },
      {
        target: 'windsurf',
        path: '.windsurf/skills/api-gen/references/checklist.md',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      canonical,
      makeConfig(['windsurf']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toContain('skills/api-gen/');
    expect(rewritten[0]!.content).toContain('skills/api-gen/references/');
    // Canonical anchor projects to the colocated windsurf skill counterpart.
    expect(rewritten[1]!.content).toBe('Use ../skills/api-gen/SKILL.md.');
  });

  it('reuses one artifact map for multiple outputs of the same target', () => {
    const projectRoot = '/proj';
    mockBuildArtifactPathMap.mockClear();

    rewriteGeneratedReferences(
      [
        {
          target: 'claude-code',
          path: '.claude/CLAUDE.md',
          content: 'See .agentsmesh/skills/api-gen/references/checklist.md.',
          status: 'created',
        },
        {
          target: 'claude-code',
          path: '.claude/commands/review.md',
          content: 'Load .agentsmesh/skills/api-gen/SKILL.md.',
          status: 'created',
        },
      ],
      makeCanonical(projectRoot),
      makeConfig(['claude-code']),
      projectRoot,
    );

    expect(mockBuildArtifactPathMap).toHaveBeenCalledTimes(1);
  });

  it('rewrites pack-absolute references/ and assets/ links in a generated skill README to sibling paths', () => {
    const projectRoot = '/proj';
    const packSkillRoot = join(
      projectRoot,
      '.agentsmesh',
      'packs',
      'arsenal',
      'skills',
      'release-manager',
    );
    const canonical: CanonicalFiles = {
      rules: [],
      commands: [],
      agents: [],
      skills: [
        {
          source: join(packSkillRoot, 'SKILL.md'),
          name: 'release-manager',
          description: '',
          body: '',
          supportingFiles: [
            {
              relativePath: 'README.md',
              absolutePath: join(packSkillRoot, 'README.md'),
              content: '',
            },
            {
              relativePath: 'references/guide.md',
              absolutePath: join(packSkillRoot, 'references', 'guide.md'),
              content: '',
            },
            {
              relativePath: 'assets/sample.txt',
              absolutePath: join(packSkillRoot, 'assets', 'sample.txt'),
              content: '',
            },
          ],
        },
      ],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };

    const packRefs = '.agentsmesh/packs/arsenal/skills/release-manager/references/';
    const packAssets = '.agentsmesh/packs/arsenal/skills/release-manager/assets/';
    const results: GenerateResult[] = [
      {
        target: 'claude-code',
        path: '.claude/skills/release-manager/README.md',
        content: `See [references](${packRefs}) and [assets](${packAssets}).`,
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/release-manager/references/guide.md',
        content: '',
        status: 'created',
      },
      {
        target: 'claude-code',
        path: '.claude/skills/release-manager/assets/sample.txt',
        content: '',
        status: 'created',
      },
    ];

    const rewritten = rewriteGeneratedReferences(
      results,
      canonical,
      makeConfig(['claude-code']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toBe('See [references](./references/) and [assets](./assets/).');
  });

  it('leaves non-markdown outputs unchanged when the referenced target is not planned', () => {
    const projectRoot = '/proj';
    const canonical = makeCanonical(projectRoot);
    canonical.skills[0] = {
      ...canonical.skills[0]!,
      supportingFiles: [
        ...canonical.skills[0]!.supportingFiles,
        {
          relativePath: 'template.ts',
          absolutePath: join(projectRoot, '.agentsmesh', 'skills', 'api-gen', 'template.ts'),
          content: '',
        },
      ],
    };

    const rewritten = rewriteGeneratedReferences(
      [
        {
          target: 'claude-code',
          path: '.claude/skills/api-gen/template.ts',
          content: 'const ref = ".agentsmesh/skills/api-gen/references/checklist.md";',
          status: 'created',
        },
      ],
      canonical,
      makeConfig(['claude-code']),
      projectRoot,
    );

    expect(rewritten[0]!.content).toBe(
      'const ref = ".agentsmesh/skills/api-gen/references/checklist.md";',
    );
  });
});
