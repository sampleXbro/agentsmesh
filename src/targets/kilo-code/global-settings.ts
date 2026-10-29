/**
 * Global-scope scoped-settings emitter for Kilo Code.
 *
 * Kilo's global config unifies rules, MCP servers, and permissions into ONE
 * file: `~/.config/kilo/kilo.jsonc` (kilo.ai/docs/getting-started/settings).
 * Additional (non-root) rules and MCP servers are documented as KEYS inside
 * that file at global scope — `instructions` (kilo.ai/docs/customize/custom-rules)
 * and `mcp` (kilo.ai/docs/automate/mcp/using-in-kilo-code) — NOT separate
 * `~/.kilo/rules/` or `~/.kilo/mcp.json` files like project scope uses. The
 * root rule (AGENTS.md), commands, and agents remain plain files at global
 * scope too (see constants.ts doc comment), so they are handled by the
 * regular generateRules/generateCommands/generateAgents + layout path
 * rewriting instead of this hook.
 *
 * Only fires at global scope: project scope keeps generateMcp's standalone
 * `.kilo/mcp.json` untouched (out of scope for this fix — see kilo-code
 * capability audit notes).
 *
 * Wiring note: this hook only runs when `generateScopedSettingsFeature`'s
 * engine.ts gate fires (`mcp`/`ignore`/`hooks`/`agents`/`permissions`
 * enabled) — `rules` alone does not trigger it. Real generate runs include
 * `permissions` by default (all `VALID_FEATURES`), so the `instructions` key
 * still gets written in practice; this mirrors an existing, accepted
 * limitation shared with OpenCode's identical `emitScopedSettings` pattern
 * (see opencode/scoped-settings.ts) rather than something unique to kilo.
 */

import type { CanonicalFiles } from '../../core/types.js';
import type { McpServer } from '../../core/mcp-types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { KILO_CODE_TARGET, KILO_CONFIG_FILE } from './constants.js';

export function toKiloMcpServer(server: McpServer): Record<string, unknown> {
  if ('url' in server) {
    const entry: Record<string, unknown> = { type: 'remote', url: server.url };
    if (Object.keys(server.headers).length > 0) entry.headers = server.headers;
    if (server.description) entry.description = server.description;
    return entry;
  }
  const entry: Record<string, unknown> = {
    type: 'local',
    command: [server.command, ...server.args],
  };
  if (Object.keys(server.env).length > 0) entry.environment = server.env;
  if (server.description) entry.description = server.description;
  return entry;
}

/** Same non-root, target-filtered predicate generateRules() uses internally. */
function hasNonRootRulesForKilo(canonical: CanonicalFiles): boolean {
  return canonical.rules.some(
    (rule) =>
      !rule.root && (rule.targets.length === 0 || rule.targets.includes(KILO_CODE_TARGET)),
  );
}

export function emitKiloGlobalSettings(
  canonical: CanonicalFiles,
  scope: TargetLayoutScope,
  enabledFeatures: ReadonlySet<string>,
): readonly { readonly path: string; readonly content: string }[] {
  if (scope !== 'global') return [];

  const content: Record<string, unknown> = {};

  if (enabledFeatures.has('rules') && hasNonRootRulesForKilo(canonical)) {
    // Relative to kilo.jsonc's own directory (~/.config/kilo/), matching the
    // documented `.kilo/rules/*.md` project-scope glob convention.
    content.instructions = ['rules/*.md'];
  }

  if (enabledFeatures.has('mcp') && canonical.mcp) {
    const servers = canonical.mcp.mcpServers;
    if (Object.keys(servers).length > 0) {
      const mcp: Record<string, unknown> = {};
      for (const [name, server] of Object.entries(servers)) {
        mcp[name] = toKiloMcpServer(server);
      }
      content.mcp = mcp;
    }
  }

  return Object.keys(content).length === 0
    ? []
    : [{ path: KILO_CONFIG_FILE, content: JSON.stringify(content, null, 2) }];
}
