/**
 * Narrow discovered canonical slice for install, then derive extends.pick and features.
 */

import type { ExtendPick } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import { ruleSlug } from './validate-resources.js';

function featuresFromImplicitPick(implicit: ExtendPick | undefined): string[] | undefined {
  if (!implicit) return undefined;
  const features: string[] = [];
  if (implicit.skills !== undefined) features.push('skills');
  if (implicit.rules !== undefined) features.push('rules');
  if (implicit.commands !== undefined) features.push('commands');
  if (implicit.agents !== undefined) features.push('agents');
  return features.length > 0 ? features : undefined;
}

export function narrowDiscoveredForInstallScope(
  canonical: CanonicalFiles,
  options: { implicitPick?: ExtendPick; scopedFeatures?: string[] },
): CanonicalFiles {
  const { implicitPick } = options;
  const scopedFeatures = options.scopedFeatures ?? featuresFromImplicitPick(implicitPick);
  if (!implicitPick && !scopedFeatures) return canonical;

  const allowed = new Set(scopedFeatures ?? []);
  let next: CanonicalFiles = {
    ...canonical,
    mcp: !scopedFeatures || allowed.has('mcp') ? canonical.mcp : null,
    permissions: !scopedFeatures || allowed.has('permissions') ? canonical.permissions : null,
    hooks: !scopedFeatures || allowed.has('hooks') ? canonical.hooks : null,
    ignore: !scopedFeatures || allowed.has('ignore') ? canonical.ignore : [],
  };

  if (implicitPick?.skills !== undefined) {
    const w = new Set(implicitPick.skills);
    next = {
      ...next,
      skills: implicitPick.skills.length === 0 ? [] : next.skills.filter((s) => w.has(s.name)),
    };
  } else if (scopedFeatures && !allowed.has('skills')) {
    next = { ...next, skills: [] };
  }

  if (implicitPick?.rules !== undefined) {
    const w = new Set(implicitPick.rules);
    next = {
      ...next,
      rules: implicitPick.rules.length === 0 ? [] : next.rules.filter((r) => w.has(ruleSlug(r))),
    };
  } else if (scopedFeatures && !allowed.has('rules')) {
    next = { ...next, rules: [] };
  }

  if (implicitPick?.commands !== undefined) {
    const w = new Set(implicitPick.commands);
    next = {
      ...next,
      commands:
        implicitPick.commands.length === 0 ? [] : next.commands.filter((c) => w.has(c.name)),
    };
  } else if (scopedFeatures && !allowed.has('commands')) {
    next = { ...next, commands: [] };
  }

  if (implicitPick?.agents !== undefined) {
    const w = new Set(implicitPick.agents);
    next = {
      ...next,
      agents: implicitPick.agents.length === 0 ? [] : next.agents.filter((a) => w.has(a.name)),
    };
  } else if (scopedFeatures && !allowed.has('agents')) {
    next = { ...next, agents: [] };
  }

  return next;
}
