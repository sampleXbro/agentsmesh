import { resolve } from 'node:path';
import type { McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { parseMcp } from '../../canonical/features/mcp.js';
import type { McpConfig } from '../../core/mcp-types.js';
import { atomicWrite, assertWithinProject } from '../writers/settings-file.js';
import { readMcpDocument } from '../writers/mcp-document.js';

export const mcpSettingsHandlers = {
  async listMcpServers(ctx: McpContext): Promise<{ servers: McpConfig['mcpServers'] | null }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/mcp.json');
    await assertWithinProject(ctx.projectRoot, path);
    try {
      const cfg = await parseMcp(path);
      return { servers: cfg?.mcpServers ?? null };
    } catch {
      return { servers: null };
    }
  },

  async addMcpServer(
    ctx: McpContext,
    input: { name: string; server: Record<string, unknown>; dry_run?: boolean },
  ): Promise<{ path: string; written: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/mcp.json');
    await assertWithinProject(ctx.projectRoot, path);
    const cfg = (await readMcpDocument(ctx.projectRoot, path)) ?? { mcpServers: {} };
    if (cfg.mcpServers[input.name] !== undefined) {
      throw new McpError('ALREADY_EXISTS', `server "${input.name}" exists`);
    }
    cfg.mcpServers[input.name] = input.server;
    if (input.dry_run === true) return { path, written: false };
    await atomicWrite(ctx.projectRoot, path, JSON.stringify(cfg, null, 2) + '\n');
    return { path, written: true };
  },

  async updateMcpServer(
    ctx: McpContext,
    input: { name: string; server: Record<string, unknown>; merge?: boolean; dry_run?: boolean },
  ): Promise<{ path: string; written: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/mcp.json');
    await assertWithinProject(ctx.projectRoot, path);
    const cfg = await readMcpDocument(ctx.projectRoot, path);
    if (cfg === null || cfg.mcpServers[input.name] === undefined) {
      throw new McpError('NOT_FOUND', `server "${input.name}" not found`);
    }
    cfg.mcpServers[input.name] =
      input.merge === true ? { ...cfg.mcpServers[input.name], ...input.server } : input.server;
    if (input.dry_run === true) return { path, written: false };
    await atomicWrite(ctx.projectRoot, path, JSON.stringify(cfg, null, 2) + '\n');
    return { path, written: true };
  },

  async removeMcpServer(
    ctx: McpContext,
    input: { name: string; dry_run?: boolean },
  ): Promise<{ path: string; removed: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/mcp.json');
    await assertWithinProject(ctx.projectRoot, path);
    const cfg = await readMcpDocument(ctx.projectRoot, path);
    if (cfg === null || cfg.mcpServers[input.name] === undefined) {
      throw new McpError('NOT_FOUND', `server "${input.name}" not found`);
    }
    delete cfg.mcpServers[input.name];
    if (input.dry_run === true) return { path, removed: false };
    await atomicWrite(ctx.projectRoot, path, JSON.stringify(cfg, null, 2) + '\n');
    return { path, removed: true };
  },
};
