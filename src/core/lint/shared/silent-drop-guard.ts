/**
 * Shared lint guard that warns when canonical content for a feature exists but
 * the target's capability for that feature is `'none'`.
 *
 * Without this guard, generation silently drops permissions, hooks, and MCP
 * servers when the user adds a target that doesn't support them — a silent
 * data-loss class of bug.
 */

import { permissionEntries } from '../../permissions.js';
import type { CanonicalFiles, LintDiagnostic } from '../../types.js';
import type { TargetCapabilities } from '../../../targets/catalog/target.interface.js';
import {
  normalizeCapabilityValue,
  type CapabilityFeatureKey,
} from '../../../targets/catalog/capabilities.js';
import { createWarning } from './helpers.js';

export interface SilentDropGuardInput {
  readonly target: string;
  readonly capabilities: TargetCapabilities;
  readonly canonical: CanonicalFiles;
  readonly enabledFeatures: readonly string[];
}

interface FeatureProbe {
  readonly canonicalKey: keyof CanonicalFiles;
  readonly capabilityKey: CapabilityFeatureKey;
  readonly featureFlag: string;
  readonly file: string;
  readonly label: string;
  readonly hasContent: (canonical: CanonicalFiles) => boolean;
}

const PROBES: readonly FeatureProbe[] = [
  {
    canonicalKey: 'permissions',
    capabilityKey: 'permissions',
    featureFlag: 'permissions',
    file: '.agentsmesh/permissions.yaml',
    label: 'permissions',
    hasContent: (c) => permissionEntries(c.permissions).length > 0,
  },
  {
    canonicalKey: 'hooks',
    capabilityKey: 'hooks',
    featureFlag: 'hooks',
    file: '.agentsmesh/hooks.yaml',
    label: 'hooks',
    hasContent: (c) => {
      const h = c.hooks;
      if (!h) return false;
      return Object.values(h).some((entries) => Array.isArray(entries) && entries.length > 0);
    },
  },
  {
    canonicalKey: 'mcp',
    capabilityKey: 'mcp',
    featureFlag: 'mcp',
    file: '.agentsmesh/mcp.json',
    label: 'MCP servers',
    hasContent: (c) => {
      const m = c.mcp;
      if (!m) return false;
      return Object.keys(m.mcpServers).length > 0;
    },
  },
  {
    canonicalKey: 'commands',
    capabilityKey: 'commands',
    featureFlag: 'commands',
    file: '.agentsmesh/commands',
    label: 'commands',
    hasContent: (c) => c.commands.length > 0,
  },
  {
    canonicalKey: 'agents',
    capabilityKey: 'agents',
    featureFlag: 'agents',
    file: '.agentsmesh/agents',
    label: 'agents',
    hasContent: (c) => c.agents.length > 0,
  },
  {
    canonicalKey: 'skills',
    capabilityKey: 'skills',
    featureFlag: 'skills',
    file: '.agentsmesh/skills',
    label: 'skills',
    hasContent: (c) => c.skills.length > 0,
  },
  {
    canonicalKey: 'ignore',
    capabilityKey: 'ignore',
    featureFlag: 'ignore',
    file: '.agentsmesh/ignore',
    label: 'ignore patterns',
    hasContent: (c) => c.ignore.length > 0,
  },
];

export function lintSilentFeatureDrops(input: SilentDropGuardInput): LintDiagnostic[] {
  const enabled = new Set(input.enabledFeatures);
  const out: LintDiagnostic[] = [];
  for (const probe of PROBES) {
    if (!enabled.has(probe.featureFlag)) continue;
    if (!probe.hasContent(input.canonical)) continue;
    const cap = normalizeCapabilityValue(input.capabilities[probe.capabilityKey]);
    if (cap.level !== 'none') continue;
    out.push(
      createWarning(
        probe.file,
        input.target,
        `${input.target} does not support ${probe.label}; canonical entries are silently dropped during generation. Disable the feature for this target or remove the canonical content.`,
      ),
    );
  }
  return out;
}
