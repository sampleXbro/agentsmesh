import type { ValidatedConfig } from './schema.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { getDescriptor } from '../../targets/catalog/registry.js';

/**
 * Read a builtin or plugin descriptor's declared conversion default.
 * `undefined` means "no default declared" — caller falls back to its own
 * `defaultEnabled` argument (used by plugin targets that haven't opted into
 * conversion projection at all).
 */
function builtinDefault(
  target: string,
  key: 'commandsToSkills' | 'agentsToSkills',
): boolean | undefined {
  return getDescriptor(target)?.conversionDefaults?.[key];
}

type ConversionValue = boolean | { project?: boolean; global?: boolean };

function resolveConversionValue(
  value: ConversionValue | undefined,
  scope: TargetLayoutScope,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return value[scope];
}

/**
 * @param defaultEnabled - For plugin targets without a declared default in
 *   their descriptor, use this as the fallback when the user hasn't set an
 *   explicit config override.
 */
export function shouldConvertCommandsToSkills(
  config: ValidatedConfig,
  target: string,
  defaultEnabled?: boolean,
  scope: TargetLayoutScope = 'project',
): boolean {
  const raw = (
    config.conversions?.commands_to_skills as Record<string, ConversionValue> | undefined
  )?.[target];
  const configVal = resolveConversionValue(raw, scope);
  if (configVal !== undefined) return configVal;
  const builtin = builtinDefault(target, 'commandsToSkills');
  if (builtin !== undefined) return builtin;
  return defaultEnabled ?? false;
}

/**
 * @param defaultEnabled - For plugin targets without a declared default in
 *   their descriptor, use this as the fallback when the user hasn't set an
 *   explicit config override.
 */
export function shouldConvertAgentsToSkills(
  config: ValidatedConfig,
  target: string,
  defaultEnabled?: boolean,
  scope: TargetLayoutScope = 'project',
): boolean {
  const raw = (
    config.conversions?.agents_to_skills as Record<string, ConversionValue> | undefined
  )?.[target];
  const configVal = resolveConversionValue(raw, scope);
  if (configVal !== undefined) return configVal;
  const builtin = builtinDefault(target, 'agentsToSkills');
  if (builtin !== undefined) return builtin;
  return defaultEnabled ?? false;
}
