import { describe, it, expect } from 'vitest';
// Import the catalog/matrix barrel first so BUILTIN_TARGETS is fully
// initialized before the jules descriptor is referenced (avoids a
// circular-import ordering hazard where individual descriptors read as
// undefined when a single target module is the entry point).
import { SUPPORT_MATRIX_GLOBAL } from '../../../../src/core/matrix/data.js';
import {
  getTargetCapabilities,
  getTargetLayout,
} from '../../../../src/targets/catalog/builtin-targets.js';
import { descriptor } from '../../../../src/targets/jules/index.js';
import { JULES_ROOT_FILE } from '../../../../src/targets/jules/constants.js';

describe('jules descriptor layout', () => {
  it('descriptor has no globalSupport (cloud-based agent)', () => {
    expect(descriptor.globalSupport).toBeUndefined();
  });

  it('project layout has rootInstructionPath set to AGENTS.md', () => {
    expect(descriptor.project.rootInstructionPath).toBe(JULES_ROOT_FILE);
  });

  it('project layout has managedOutputs with AGENTS.md', () => {
    expect(descriptor.project.managedOutputs?.files).toEqual([JULES_ROOT_FILE]);
    expect(descriptor.project.managedOutputs?.dirs).toEqual([]);
  });

  it('capabilities reflect expected support levels', () => {
    expect(descriptor.capabilities.rules).toBe('native');
    expect(descriptor.capabilities.additionalRules).toBe('embedded');
    expect(descriptor.capabilities.commands).toBe('partial');
    expect(descriptor.capabilities.agents).toBe('none');
    expect(descriptor.capabilities.skills).toBe('none');
    expect(descriptor.capabilities.mcp).toBe('partial');
    expect(descriptor.capabilities.hooks).toBe('partial');
    expect(descriptor.capabilities.ignore).toBe('none');
    expect(descriptor.capabilities.permissions).toBe('partial');
  });

  it('detection paths include AGENTS.md', () => {
    expect(descriptor.detectionPaths).toContain(JULES_ROOT_FILE);
  });

  it('emptyImportMessage mentions Jules', () => {
    expect(descriptor.emptyImportMessage).toContain('Jules');
    expect(descriptor.emptyImportMessage).toContain('AGENTS.md');
  });

  it('does not declare supportsConversion', () => {
    expect(descriptor.supportsConversion).toBeUndefined();
  });

  it('does not declare sharedArtifacts', () => {
    expect(descriptor).not.toHaveProperty('sharedArtifacts');
  });

  it('descriptor id matches target constant', () => {
    expect(descriptor.id).toBe('jules');
  });

  it('generators name matches target id', () => {
    expect(descriptor.generators.name).toBe('jules');
  });

  it('project layout rulePath returns AGENTS.md for any slug', () => {
    expect(descriptor.project.paths.rulePath('typescript', {} as never)).toBe(JULES_ROOT_FILE);
  });

  it('project layout has no skillDir', () => {
    expect(descriptor.project.skillDir).toBeUndefined();
  });

  it('global-scope capabilities resolve to none for every feature', () => {
    const caps = getTargetCapabilities('jules', 'global');
    expect(caps).toBeDefined();
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(caps![feature]?.level).toBe('none');
      expect(SUPPORT_MATRIX_GLOBAL[feature].jules.level).toBe('none');
    }
  });

  it('has no global layout (generation in global scope is impossible)', () => {
    expect(getTargetLayout('jules', 'global')).toBeUndefined();
  });
});
