import type { CanonicalFiles } from '../../../core/types.js';
import { GEMINI_ROOT, GEMINI_COMPAT_AGENTS, GEMINI_SETTINGS } from '../constants.js';
import { buildGeminiHooks } from './hooks.js';
import type { RulesOutput } from './types.js';

/**
 * Emits merged `.gemini/settings.json` when MCP, agents, or hooks contribute native settings.
 *
 * Each key is gated on its corresponding feature being present in
 * `enabledFeatures` so a disabled feature never leaks into the sidecar.
 */
export function generateGeminiSettingsFiles(
  canonical: CanonicalFiles,
  enabledFeatures: ReadonlySet<string>,
): RulesOutput[] {
  const settings: Record<string, unknown> = {};
  let hasAnyNativeSettings = false;

  if (
    enabledFeatures.has('mcp') &&
    canonical.mcp &&
    Object.keys(canonical.mcp.mcpServers).length > 0
  ) {
    settings.mcpServers = canonical.mcp.mcpServers;
    hasAnyNativeSettings = true;
  }
  if (enabledFeatures.has('agents') && canonical.agents.length > 0) {
    settings.experimental = { enableAgents: true };
    hasAnyNativeSettings = true;
  }
  const hooks = enabledFeatures.has('hooks') ? buildGeminiHooks(canonical.hooks) : null;
  if (hooks) {
    settings.hooks = hooks;
    hasAnyNativeSettings = true;
  }

  if (hasAnyNativeSettings) {
    settings.context = { fileName: [GEMINI_ROOT, GEMINI_COMPAT_AGENTS] };
  }

  if (Object.keys(settings).length === 0) return [];
  return [{ path: GEMINI_SETTINGS, content: JSON.stringify(settings, null, 2) }];
}
