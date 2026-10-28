/**
 * Seed the agentsmesh self-serve MCP entry into .agentsmesh/mcp.json.
 * Single source of truth for the entry value — used by both init and import flows.
 */

import { resolve } from 'node:path';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { stripJsonComments } from '../../utils/text/json-comments.js';

export const MCP_AGENTSMESH_ENTRY_VALUE = {
  type: 'stdio' as const,
  command: 'npx',
  args: ['-y', 'agentsmesh', 'mcp'],
};

/**
 * Inject the agentsmesh entry into a parsed mcp.json structure if absent.
 * Returns true if the structure was modified.
 */
export function injectAgentsmeshEntry(mcpJson: { mcpServers: Record<string, unknown> }): boolean {
  if (mcpJson.mcpServers.agentsmesh !== undefined) return false;
  mcpJson.mcpServers.agentsmesh = MCP_AGENTSMESH_ENTRY_VALUE;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type ReadOutcome =
  | { kind: 'missing' }
  | { kind: 'document'; doc: Record<string, unknown>; commented: boolean }
  | { kind: 'skip'; reason: string };

/**
 * Read the file as the raw JSON document the user wrote.
 *
 * Deliberately NOT `parseMcp`: that normalizes into the canonical model, which
 * drops per-server fields agentsmesh does not model (`cwd`, `disabled`,
 * `timeout`) and every top-level key, so writing its output back erased them.
 * A file we cannot rewrite safely is skipped rather than replaced — the same
 * rule the generated-output mergers follow. A commented file is still read, so
 * the caller can see the entry is already there before refusing the rewrite.
 */
async function readRawDocument(path: string): Promise<ReadOutcome> {
  const raw = await readFileSafe(path);
  if (raw === null || raw.trim() === '') return { kind: 'missing' };

  const json = stripJsonComments(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { kind: 'skip', reason: 'it is not valid JSON' };
  }
  if (!isObject(parsed)) return { kind: 'skip', reason: 'its top level is not an object' };
  if (parsed.mcpServers !== undefined && !isObject(parsed.mcpServers)) {
    return { kind: 'skip', reason: 'its "mcpServers" value is not an object' };
  }
  return { kind: 'document', doc: parsed, commented: json !== raw };
}

function warn(message: string): void {
  process.stderr.write(`[agentsmesh] warning: ${message}\n`);
}

function leaveUntouched(path: string, reason: string): false {
  warn(
    `left ${path} untouched because ${reason}. Add the agentsmesh MCP server by hand ` +
      'if you want it available to your agents.',
  );
  return false;
}

/**
 * Read .agentsmesh/mcp.json (creating it if missing), inject the agentsmesh
 * entry if absent, and atomically write back. Returns true if written.
 *
 * Every other key in the document survives. On any failure — including a file
 * we decline to rewrite — logs a warning to stderr and returns false.
 */
export async function seedAgentsmeshMcpEntry(projectRoot: string): Promise<boolean> {
  const path = resolve(projectRoot, '.agentsmesh/mcp.json');
  try {
    const outcome = await readRawDocument(path);
    if (outcome.kind === 'skip') return leaveUntouched(path, outcome.reason);

    const doc = outcome.kind === 'document' ? outcome.doc : {};
    const servers = isObject(doc.mcpServers) ? doc.mcpServers : {};
    if (!injectAgentsmeshEntry({ mcpServers: servers })) return false;
    if (outcome.kind === 'document' && outcome.commented) {
      return leaveUntouched(path, 'it contains comments that a rewrite would discard');
    }
    doc.mcpServers = servers;

    await writeFileAtomic(path, `${JSON.stringify(doc, null, 2)}\n`);
    return true;
  } catch (e) {
    warn(
      `could not seed agentsmesh MCP server entry into mcp.json: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}
