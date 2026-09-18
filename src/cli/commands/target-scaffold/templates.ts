/**
 * Template functions for `agentsmesh target scaffold`. Each function
 * returns a string of TypeScript source code. Pattern mirrors
 * `src/cli/commands/init-templates.ts` (string constants, bundled by tsup).
 *
 * The descriptor (TEMPLATE_INDEX) and test fixtures (TEMPLATE_*_TEST,
 * TEMPLATE_FIXTURE_ROOT_MD) live in sibling files to keep this barrel
 * under the 200-line file budget (CLAUDE.md).
 */
import { toPascal, toPrefix, type TemplateVars } from './templates-shared.js';

export type { TemplateVars } from './templates-shared.js';
export { TEMPLATE_INDEX } from './templates-index.js';
export {
  TEMPLATE_FIXTURE_ROOT_MD,
  TEMPLATE_GENERATOR_TEST,
  TEMPLATE_IMPORTER_TEST,
} from './templates-tests.js';

export function TEMPLATE_CONSTANTS(v: TemplateVars): string {
  const p = toPrefix(v.id);
  return `export const ${p}_TARGET = '${v.id}';

// Project-level paths
export const ${p}_DIR = '.${v.id}';
export const ${p}_RULES_DIR = '.${v.id}/rules';

// Global-level paths
export const ${p}_GLOBAL_DIR = '~/.${v.id}';
export const ${p}_GLOBAL_RULES_DIR = '~/.${v.id}/rules';

// Canonical paths live once in src/core/canonical-paths.ts — import AB_ROOT_RULE /
// AB_RULES from there rather than re-declaring the literals here.
`;
}

export function TEMPLATE_GENERATOR(v: TemplateVars): string {
  const p = toPrefix(v.id);
  return `import type { CanonicalFiles } from '../../core/types.js';
import { ${p}_TARGET, ${p}_DIR } from './constants.js';

export interface ${toPascal(v.id)}Output {
  path: string;
  content: string;
}

export function generateRules(_canonical: CanonicalFiles): ${toPascal(v.id)}Output[] {
  // TODO(agentsmesh-scaffold): implement generateRules for ${v.displayName}
  void ${p}_TARGET;
  void ${p}_DIR;
  return [];
}
`;
}

export function TEMPLATE_IMPORTER(v: TemplateVars): string {
  const pascal = toPascal(v.id);
  const p = toPrefix(v.id);
  return `import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { ${p}_TARGET } from './constants.js';

export async function importFrom${pascal}(
  _projectRoot: string,
  _options?: { scope?: TargetLayoutScope },
): Promise<ImportResult[]> {
  // TODO(agentsmesh-scaffold): implement importFrom${pascal} for ${v.displayName}
  void ${p}_TARGET;
  return [];
}
`;
}

export function TEMPLATE_LINTER(v: TemplateVars): string {
  const p = toPrefix(v.id);
  return `/** Lint rules for the ${v.id} target. */
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { validateRules } from '../../core/lint/validate-rules.js';
import { ${p}_TARGET } from './constants.js';

export function lintRules(
  canonical: CanonicalFiles,
  projectRoot: string,
  projectFiles: string[],
  options?: { scope?: 'project' | 'global' },
): LintDiagnostic[] {
  return validateRules(canonical, projectRoot, projectFiles, {
    checkGlobMatches: options?.scope !== 'global',
  }).map((diagnostic) => ({
    ...diagnostic,
    target: ${p}_TARGET,
  }));
}
`;
}

export function TEMPLATE_LINT_HOOKS(v: TemplateVars): string {
  return `/**
 * ${v.displayName}-specific lint hooks.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';

export function lintHooks(_canonical: CanonicalFiles): LintDiagnostic[] {
  // TODO(agentsmesh-scaffold): implement target-specific hook validation for ${v.displayName}
  return [];
}
`;
}

export function TEMPLATE_IMPORT_MAP(v: TemplateVars): string {
  const pascal = toPascal(v.id);
  const p = toPrefix(v.id);
  return `import type { TargetLayoutScope } from '../../../targets/catalog/target-descriptor.js';
import { ${p}_DIR } from '../../../targets/${v.id}/constants.js';

export async function build${pascal}ImportPaths(
  _refs: Map<string, string>,
  _projectRoot: string,
  _scope: TargetLayoutScope = 'project',
): Promise<void> {
  // TODO(agentsmesh-scaffold): implement import path mapping for ${v.displayName}
  // Reference: src/core/reference/import-maps/kiro.ts for a full example
  void ${p}_DIR;
}
`;
}
