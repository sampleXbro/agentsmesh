/**
 * Jules target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md` — root rule + embedded additional rules
 *
 * Import reads `AGENTS.md` for root instructions.
 *
 * Jules is Google's asynchronous coding agent. It clones repos
 * into isolated cloud VMs and works via GitHub PRs. There is no
 * local skills directory, MCP support, or global config — all
 * configuration is through `AGENTS.md` at project root.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import { importFromJules } from './importer.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions, lintIgnore, lintMcp, lintCommands } from './lint.js';
import { buildJulesImportPaths } from '../../core/reference/import-map-builders.js';
import { JULES_TARGET, JULES_ROOT_FILE } from './constants.js';

export const target: TargetGenerators = {
  name: JULES_TARGET,
  primaryRootInstructionPath: JULES_ROOT_FILE,
  generateRules,
  generateCommands,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromJules,
};

const project: TargetLayout = {
  rootInstructionPath: JULES_ROOT_FILE,
  managedOutputs: {
    dirs: [],
    files: [JULES_ROOT_FILE],
  },
  paths: {
    rulePath(_slug) {
      return JULES_ROOT_FILE;
    },
    commandPath() {
      return null;
    },
    agentPath() {
      return null;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'partial',
  agents: 'none',
  skills: 'none',
  mcp: 'partial',
  hooks: 'partial',
  ignore: 'partial',
  permissions: 'partial',
};

export const descriptor = {
  id: JULES_TARGET,
  metadata: {
    displayName: 'Jules',
    category: 'agent-platform',
    officialUrl: 'https://jules.google',
    shortDescription: "Google's autonomous coding agent",
  },
  generators: target,
  capabilities,
  emptyImportMessage: 'No Jules config found (AGENTS.md).',
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
    ignore: lintIgnore,
    mcp: lintMcp,
    commands: lintCommands,
  },
  project,
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [JULES_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
  },
  buildImportPaths: buildJulesImportPaths,
  detectionPaths: [JULES_ROOT_FILE],
} satisfies TargetDescriptor;
