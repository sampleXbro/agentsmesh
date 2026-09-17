/**
 * Generate Jules target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md` — root rule + embedded non-root rules
 *
 * Jules is a cloud-based async agent — it only reads `AGENTS.md`
 * for project-level instructions. No skills, MCP, or other files.
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { JULES_TARGET, JULES_ROOT_FILE } from './constants.js';

export type JulesOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): JulesOutput[] =>
  embeddedRootRule(canonical, JULES_TARGET, JULES_ROOT_FILE);

export const generateCommands = NO_OUTPUTS;

export const generateMcp = NO_OUTPUTS;

export const generateHooks = NO_OUTPUTS;

export const generateIgnore = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;
