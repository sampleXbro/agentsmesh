import type { CanonicalFiles, LintDiagnostic } from '../types.js';
import { createWarning } from './shared/helpers.js';
import { AB_COMMANDS, AB_HOOKS, AB_IGNORE, AB_MCP, AB_PERMISSIONS } from '../canonical-paths.js';

/** Canonical features a target can declare unsupported wholesale. */
export type GapFeature = 'commands' | 'hooks' | 'ignore' | 'mcp' | 'permissions';

const CANONICAL_PATH: Record<GapFeature, string> = {
  commands: AB_COMMANDS,
  hooks: AB_HOOKS,
  ignore: AB_IGNORE,
  mcp: AB_MCP,
  permissions: AB_PERMISSIONS,
};

const HAS_CONTENT: Record<GapFeature, (canonical: CanonicalFiles) => boolean> = {
  commands: (c) => c.commands.length > 0,
  ignore: (c) => c.ignore.length > 0,
  mcp: (c) => Boolean(c.mcp) && Object.keys(c.mcp?.mcpServers ?? {}).length > 0,
  hooks: (c) =>
    Boolean(c.hooks) &&
    Object.values(c.hooks ?? {}).some((entries) => Array.isArray(entries) && entries.length > 0),
  permissions: (c) => {
    if (!c.permissions) return false;
    const { allow, deny } = c.permissions;
    const ask = c.permissions.ask ?? [];
    return allow.length > 0 || deny.length > 0 || ask.length > 0;
  },
};

/**
 * A linter for a canonical feature the target cannot project at all: warns once,
 * naming the canonical file, only when that feature actually carries content.
 */
export function unsupportedFeature(
  feature: GapFeature,
  target: string,
  message: string,
): (canonical: CanonicalFiles) => LintDiagnostic[] {
  return (canonical) =>
    HAS_CONTENT[feature](canonical)
      ? [createWarning(CANONICAL_PATH[feature], target, message)]
      : [];
}
