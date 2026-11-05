/**
 * Parse .agentsmesh/permissions.yaml into Permissions.
 */

import { failSyntax, type ParseErrorCallback } from './syntax-error.js';
import { parse as parseYaml } from 'yaml';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import type { Permissions } from '../../core/types.js';
import { PERMISSION_LISTS } from '../../core/permissions.js';

/**
 * Parse permissions.yaml at the given path.
 * @param permissionsPath - Absolute path to .agentsmesh/permissions.yaml
 * @returns Permissions, or null if the file is missing or holds no list
 */
export async function parsePermissions(
  permissionsPath: string,
  onParseError?: ParseErrorCallback,
): Promise<Permissions | null> {
  const content = await readFileSafe(permissionsPath);
  if (content === null) return null;
  return parsePermissionsContent(content, permissionsPath, onParseError);
}

/**
 * Parse permissions.yaml text; `permissionsPath` only names the file in errors.
 * Only a key holding a YAML list is managed; a missing list stays absent.
 */
export function parsePermissionsContent(
  content: string,
  permissionsPath: string,
  onParseError?: ParseErrorCallback,
): Permissions | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(content) as unknown;
  } catch (err) {
    return failSyntax(permissionsPath, err, onParseError);
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const permissions: Permissions = {};
  for (const list of PERMISSION_LISTS) {
    const value = obj[list];
    if (Array.isArray(value)) {
      permissions[list] = value.filter((x): x is string => typeof x === 'string');
    }
  }
  return Object.keys(permissions).length > 0 ? permissions : null;
}
