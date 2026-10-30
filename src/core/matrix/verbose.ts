import { permissionEntries } from '../permissions.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../types.js';

/**
 * Format per-file details for --verbose output.
 */
export function formatVerboseDetails(canonical: CanonicalFiles): string {
  const lines: string[] = [];
  if (canonical.rules.length > 0) {
    lines.push(`rules: ${canonical.rules.map((r) => basename(r.source)).join(', ')}`);
  }
  if (canonical.commands.length > 0) {
    lines.push(`commands: ${canonical.commands.map((c) => basename(c.source)).join(', ')}`);
  }
  if (canonical.agents.length > 0) {
    lines.push(`agents: ${canonical.agents.map((a) => basename(a.source)).join(', ')}`);
  }
  if (canonical.skills.length > 0) {
    lines.push(`skills: ${canonical.skills.map((s) => s.name).join(', ')}`);
  }
  if (canonical.mcp && Object.keys(canonical.mcp.mcpServers).length > 0) {
    lines.push(`mcp: ${Object.keys(canonical.mcp.mcpServers).join(', ')}`);
  }
  if (canonical.hooks) {
    const count = Object.values(canonical.hooks).reduce(
      (n, arr) => n + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
    if (count > 0) lines.push(`hooks: ${count} entries in hooks.yaml`);
  }
  if (canonical.ignore.length > 0) {
    lines.push('ignore: .agentsmesh/ignore');
  }
  if (permissionEntries(canonical.permissions).length > 0) {
    lines.push('permissions: .agentsmesh/permissions.yaml');
  }
  if (lines.length === 0) return '';
  return '\nPer-file details:\n' + lines.join('\n') + '\n';
}
