/**
 * Aider target descriptor.
 *
 * Generation emits:
 *   - `CONVENTIONS.md`    — root rule + embedded additional rules
 *   - `.aider.conf.yml`   — the `read:` wiring for CONVENTIONS.md (project scope
 *     only) plus the hook command keys (both scopes)
 *   - `.aider/skills/`    — skill bundles
 *   - `.aiderignore`      — ignore patterns
 *
 * `.aider.conf.yml` is the user's own config, so it is neither a rules output
 * nor a hooks output: `emitScopedSettings` writes the whole agentsmesh
 * projection once (`conf-file.ts`), `mergeGeneratedOutputContent` merges it
 * key-scoped into whatever is already there, and it is deliberately absent from
 * `managedOutputs` so stale cleanup can never delete it.
 *
 * Import reads `CONVENTIONS.md`, `.aider/skills/`, `.aiderignore`, and the hook
 * keys of `.aider.conf.yml`. The `read:` wiring is deterministic and is not
 * imported as canonical content.
 */

import { AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import { commandSkillDirName } from '../codex-cli/command-skill.js';
import { mergeAiderConf } from './conf-merge.js';
import { clearAiderConf, emitAiderConf } from './conf-file.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  generateMcp,
  generatePermissions,
} from './generator.js';
import { importFromAider } from './importer.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions, lintMcp } from './lint.js';
import { buildAiderImportPaths } from '../../core/reference/import-map-builders.js';
import {
  AIDER_TARGET,
  AIDER_CONVENTIONS,
  AIDER_CONF_FILE,
  AIDER_SKILLS_DIR,
  AIDER_IGNORE,
  AIDER_GLOBAL_CONVENTIONS,
  AIDER_GLOBAL_SKILLS_DIR,
  AIDER_GLOBAL_IGNORE,
} from './constants.js';

export const target: TargetGenerators = {
  name: AIDER_TARGET,
  primaryRootInstructionPath: AIDER_CONVENTIONS,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  generateMcp,
  generatePermissions,
  importFrom: importFromAider,
};

const project: TargetLayout = {
  rootInstructionPath: AIDER_CONVENTIONS,
  skillDir: AIDER_SKILLS_DIR,
  // `.aider.conf.yml` is deliberately absent: it is the user's own aider config
  // (model, keys, editor settings) that agentsmesh only merges keys into, and
  // stale cleanup deletes every listed file a run does not emit.
  managedOutputs: {
    dirs: [AIDER_SKILLS_DIR],
    files: [AIDER_CONVENTIONS, AIDER_IGNORE],
  },
  paths: {
    rulePath(_slug) {
      return AIDER_CONVENTIONS;
    },
    commandPath(name) {
      return `${AIDER_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${AIDER_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: AIDER_GLOBAL_CONVENTIONS,
  skillDir: AIDER_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [AIDER_GLOBAL_SKILLS_DIR],
    files: [AIDER_GLOBAL_CONVENTIONS, AIDER_GLOBAL_IGNORE],
  },
  rewriteGeneratedPath(path) {
    if (path === AIDER_CONVENTIONS) return AIDER_GLOBAL_CONVENTIONS;
    if (path === AIDER_IGNORE) return AIDER_GLOBAL_IGNORE;
    // `.aider.conf.yml` passes through: aider loads it from the home directory
    // too, so the hook keys land in `~/.aider.conf.yml`. The `read:` wiring is
    // suppressed at the source (see `generateRules`), not by path.
    if (path.startsWith(`${AIDER_SKILLS_DIR}/`)) {
      return path.replace(`${AIDER_SKILLS_DIR}/`, `${AIDER_GLOBAL_SKILLS_DIR}/`);
    }
    return path;
  },
  paths: {
    rulePath(_slug) {
      return AIDER_GLOBAL_CONVENTIONS;
    },
    commandPath(name) {
      return `${AIDER_GLOBAL_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${AIDER_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'none',
  agents: 'none',
  skills: 'native',
  mcp: 'partial',
  // `.aider.conf.yml` test-cmd/auto-test/lint-cmd/auto-lint/notifications-command
  // are aider's own keys for running commands around edits — its whole hook
  // surface, generated and imported. See `hooks-format.ts`.
  hooks: 'native',
  ignore: 'native',
  permissions: 'partial',
};

export const descriptor = {
  id: AIDER_TARGET,
  metadata: {
    displayName: 'Aider',
    category: 'cli',
    officialUrl: 'https://aider.chat',
    shortDescription: 'Open-source terminal AI pair programmer',
  },
  generators: target,
  capabilities,
  emptyImportMessage: 'No Aider config found (CONVENTIONS.md, .aider/skills, or .aiderignore).',
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
    mcp: lintMcp,
  },
  supportsConversion: { commands: true, agents: true },
  project,
  globalSupport: {
    capabilities,
    detectionPaths: [AIDER_GLOBAL_CONVENTIONS, AIDER_GLOBAL_IGNORE, AIDER_GLOBAL_SKILLS_DIR],
    layout: globalLayout,
    // Runs at both scopes: the only pass that reads `.aider.conf.yml`, so the
    // only one that can clear the keys agentsmesh wrote without creating an
    // empty config file where there was none. See `conf-file.ts`.
    scopeExtras: clearAiderConf,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [AIDER_CONVENTIONS],
        global: [AIDER_GLOBAL_CONVENTIONS],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      source: {
        project: [AIDER_IGNORE],
        global: [AIDER_GLOBAL_IGNORE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  // `.aider.conf.yml` carries the `read:` wiring and the hook keys of a file the
  // user owns, so every write merges key-scoped into what is already there.
  emitScopedSettings: emitAiderConf,
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    if (resolvedPath !== AIDER_CONF_FILE) return null;
    return mergeAiderConf(pending?.content ?? existing, newContent);
  },
  buildImportPaths: buildAiderImportPaths,
  detectionPaths: [AIDER_CONVENTIONS, AIDER_IGNORE],
} satisfies TargetDescriptor;
