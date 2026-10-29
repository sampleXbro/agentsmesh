import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinTargetDefinition } from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  GOOSE_ROOT_FILE,
  GOOSE_IGNORE,
  GOOSE_GLOBAL_ROOT_FILE,
  GOOSE_GLOBAL_IGNORE,
  GOOSE_SKILLS_DIR,
  GOOSE_GLOBAL_SKILLS_DIR,
  GOOSE_GLOBAL_CONFIG,
  GOOSE_GLOBAL_PERMISSIONS,
} from '../../../../src/targets/goose/constants.js';
import { parse as parseYaml } from 'yaml';

describe('goose global layout', () => {
  const descriptor = getBuiltinTargetDefinition('goose')!;

  it('descriptor.globalSupport exists', () => {
    expect(descriptor.globalSupport).toBeDefined();
  });

  it('globalSupport has layout with rewriteGeneratedPath', () => {
    expect(descriptor.globalSupport!.layout.rewriteGeneratedPath).toBeDefined();
  });

  it('rewriteGeneratedPath transforms .goosehints to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(GOOSE_ROOT_FILE, '')).toBe(GOOSE_GLOBAL_ROOT_FILE);
  });

  it('rewriteGeneratedPath transforms .gooseignore to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(GOOSE_IGNORE, '')).toBe(GOOSE_GLOBAL_IGNORE);
  });

  it('rewriteGeneratedPath preserves .agents/skills/ paths', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const skillPath = `${GOOSE_SKILLS_DIR}/debugging/SKILL.md`;
    expect(rewrite(skillPath, '')).toBe(skillPath);
  });

  it('has mcp native in both scopes (different files, both real)', () => {
    expect(descriptor.globalSupport!.capabilities.mcp).toBe('native');
    expect(descriptor.capabilities.mcp).toBe('native');
  });

  it('globalSupport.capabilities has permissions native (project has partial)', () => {
    expect(descriptor.globalSupport!.capabilities.permissions).toBe('native');
    expect(descriptor.capabilities.permissions).toBe('none');
  });

  it('rewriteGeneratedPath passes through global config path unchanged', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(GOOSE_GLOBAL_CONFIG, '')).toBe(GOOSE_GLOBAL_CONFIG);
  });

  it('globalSupport has detection paths', () => {
    expect(descriptor.globalSupport!.detectionPaths.length).toBeGreaterThan(0);
    expect(descriptor.globalSupport!.detectionPaths).toContain(GOOSE_GLOBAL_ROOT_FILE);
  });
});

describe('goose global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-goose-global-fm');

  function makeGlobalConfig(): ValidatedConfig {
    return {
      version: 1,
      targets: ['goose'],
      features: ['rules', 'skills'],
      extends: [],
      overrides: {},
      collaboration: { strategy: 'merge', lock_features: [] },
    } as ValidatedConfig;
  }

  function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
    return {
      rules: [],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
      ...overrides,
    };
  }

  it('preserves embedded skill frontmatter in global mode', async () => {
    const results = await generate({
      config: makeGlobalConfig(),
      canonical: makeCanonical({
        skills: [
          {
            source: '/proj/.agentsmesh/skills/debugging/SKILL.md',
            name: 'debugging',
            description: 'Debug workflow',
            body: '# Debugging\n\nReproduce first.',
            supportingFiles: [],
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const skill = results.find(
      (r) => r.target === 'goose' && r.path === `${GOOSE_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`,
    );
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: debugging');
    expect(skill!.content).toContain('description: Debug workflow');
    expect(skill!.content).toContain('# Debugging');
  });

  it('preserves rule body content in global mode', async () => {
    const results = await generate({
      config: makeGlobalConfig(),
      canonical: makeCanonical({
        rules: [
          {
            source: '/proj/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: 'Use TDD and strict TypeScript.',
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const rule = results.find((r) => r.target === 'goose' && r.path === GOOSE_GLOBAL_ROOT_FILE);
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('Use TDD and strict TypeScript.');
  });

  it('emits ~/.config/goose/permission.yaml from canonical permissions via scopeExtras', async () => {
    const results = await generate({
      config: {
        version: 1,
        targets: ['goose'],
        features: ['permissions'],
        extends: [],
        overrides: {},
        collaboration: { strategy: 'merge', lock_features: [] },
      } as ValidatedConfig,
      canonical: makeCanonical({
        permissions: { allow: ['developer__shell'], deny: ['developer__rm'], ask: [] },
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const perm = results.find((r) => r.target === 'goose' && r.path === GOOSE_GLOBAL_PERMISSIONS);
    expect(perm).toBeDefined();
    const parsed = parseYaml(perm!.content) as Record<string, Record<string, unknown>>;
    expect(parsed.user.always_allow).toEqual(['developer__shell']);
    expect(parsed.user.never_allow).toEqual(['developer__rm']);
  });

  it('emits no permission.yaml when canonical carries no permissions', async () => {
    const results = await generate({
      config: {
        version: 1,
        targets: ['goose'],
        features: ['permissions'],
        extends: [],
        overrides: {},
        collaboration: { strategy: 'merge', lock_features: [] },
      } as ValidatedConfig,
      canonical: makeCanonical({ permissions: { allow: [], deny: [], ask: [] } }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    expect(results.filter((r) => r.path === GOOSE_GLOBAL_PERMISSIONS)).toEqual([]);
  });
});
