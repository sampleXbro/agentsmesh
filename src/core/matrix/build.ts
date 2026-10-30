import { permissionEntries } from '../permissions.js';
import type { CanonicalFiles, CompatibilityRow, SupportLevel } from '../types.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import type { TargetCapabilities } from '../../targets/catalog/target.interface.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';
import { getEffectiveTargetSupportLevel } from '../../targets/catalog/builtin-targets.js';

/**
 * Build compatibility rows for enabled features.
 */
export function buildCompatibilityMatrix(
  config: ValidatedConfig,
  canonical: CanonicalFiles,
  scope: TargetLayoutScope = 'project',
): CompatibilityRow[] {
  const rows: CompatibilityRow[] = [];
  const targets = [...config.targets, ...(config.pluginTargets ?? [])];

  for (const featureId of config.features) {
    let label: string;
    let count: number;

    switch (featureId) {
      case 'rules':
        count = canonical.rules.length;
        label = 'rules';
        break;
      case 'commands':
        count = canonical.commands.length;
        label = count > 0 ? `commands (${count})` : 'commands';
        break;
      case 'agents':
        count = canonical.agents.length;
        label = count > 0 ? `agents (${count})` : 'agents';
        break;
      case 'skills':
        count = canonical.skills.length;
        label = count > 0 ? `skills (${count})` : 'skills';
        break;
      case 'mcp':
        count = canonical.mcp ? Object.keys(canonical.mcp.mcpServers).length : 0;
        label = count > 0 ? `mcp (${count} servers)` : 'mcp';
        break;
      case 'hooks':
        count = countHooks(canonical.hooks);
        label = count > 0 ? `hooks (${count})` : 'hooks';
        break;
      case 'ignore':
        count = canonical.ignore.length > 0 ? 1 : 0;
        label = 'ignore';
        break;
      case 'permissions':
        count = permissionEntries(canonical.permissions).length > 0 ? 1 : 0;
        label = 'permissions';
        break;
      default:
        continue;
    }

    const support: Record<string, SupportLevel> = {};
    for (const t of targets) {
      support[t] = getEffectiveTargetSupportLevel(
        t,
        featureId as keyof TargetCapabilities,
        config,
        scope,
      );
    }

    rows.push({ feature: label, count, support });

    if (featureId === 'rules') {
      const additionalRules = canonical.rules.filter((rule) => !rule.root);
      if (additionalRules.length > 0) {
        const additionalSupport: Record<string, SupportLevel> = {};
        for (const t of targets) {
          additionalSupport[t] = getEffectiveTargetSupportLevel(
            t,
            'additionalRules',
            config,
            scope,
          );
        }
        rows.push({
          feature: `additional rules (${additionalRules.length})`,
          count: additionalRules.length,
          support: additionalSupport,
        });
      }
    }
  }

  return rows;
}

function countHooks(hooks: CanonicalFiles['hooks']): number {
  if (!hooks) return 0;
  let n = 0;
  for (const arr of Object.values(hooks)) {
    if (Array.isArray(arr)) n += arr.length;
  }
  return n;
}
