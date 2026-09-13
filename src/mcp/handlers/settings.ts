import { stringify as stringifyYaml } from 'yaml';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { safeConfigWrite } from '../writers/safe-config-write.js';
import { readYaml, atomicWrite, assertWithinProject } from '../writers/settings-file.js';
import { mcpSettingsHandlers } from './settings-mcp.js';
import { normalizeHooksRecord } from '../writers/normalize-hooks.js';
import { configSchema } from '../../config/core/schema.js';

export const settingsHandlers = {
  ...mcpSettingsHandlers,
  // ─── reads ───

  async getConfig(ctx: McpContext): Promise<unknown> {
    const cfg = await readYaml<unknown>(
      ctx.projectRoot,
      resolve(ctx.projectRoot, 'agentsmesh.yaml'),
    );
    if (cfg === null) throw new McpError('NO_PROJECT', 'agentsmesh.yaml missing');
    return cfg;
  },

  async getPermissions(ctx: McpContext): Promise<unknown> {
    return (
      (await readYaml(ctx.projectRoot, resolve(ctx.projectRoot, '.agentsmesh/permissions.yaml'))) ??
      null
    );
  },

  async getHooks(ctx: McpContext): Promise<unknown> {
    return (
      (await readYaml(ctx.projectRoot, resolve(ctx.projectRoot, '.agentsmesh/hooks.yaml'))) ?? null
    );
  },

  async getIgnore(ctx: McpContext): Promise<{ patterns: string[] | null }> {
    const file = resolve(ctx.projectRoot, '.agentsmesh/ignore');
    await assertWithinProject(ctx.projectRoot, file);
    try {
      const src = await readFile(file, 'utf8');
      return { patterns: src.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('#')) };
    } catch {
      return { patterns: null };
    }
  },

  // ─── mutations ───

  async updateConfig(
    ctx: McpContext,
    input: {
      targets?: string[];
      features?: string[];
      conversions?: Record<string, unknown>;
      merge?: boolean;
      dry_run?: boolean;
      filename?: 'agentsmesh.yaml';
    },
  ): Promise<{ path: string; written: boolean }> {
    const current =
      (await readYaml<Record<string, unknown>>(
        ctx.projectRoot,
        resolve(ctx.projectRoot, 'agentsmesh.yaml'),
      )) ?? {};
    const next: Record<string, unknown> = { ...current };
    const apply = (k: 'targets' | 'features', v: string[] | undefined): void => {
      if (v === undefined) return;
      next[k] =
        input.merge === true && Array.isArray(current[k])
          ? Array.from(new Set([...(current[k] as string[]), ...v]))
          : v;
    };
    apply('targets', input.targets);
    apply('features', input.features);
    if (input.conversions !== undefined) {
      next.conversions =
        input.merge === true && current.conversions !== undefined
          ? { ...(current.conversions as object), ...input.conversions }
          : input.conversions;
    }
    const parsed = configSchema.safeParse(next);
    if (!parsed.success) {
      throw new McpError('VALIDATION_FAILED', 'invalid config', parsed.error.issues);
    }
    const yaml = stringifyYaml(next);
    if (input.dry_run === true) {
      return { path: resolve(ctx.projectRoot, 'agentsmesh.yaml'), written: false };
    }
    const path = await safeConfigWrite({
      projectRoot: ctx.projectRoot,
      content: yaml,
      filename: input.filename,
    });
    return { path, written: true };
  },

  async updatePermissions(
    ctx: McpContext,
    input: {
      allow?: string[];
      deny?: string[];
      ask?: string[];
      mode?: 'replace' | 'append';
      dry_run?: boolean;
    },
  ): Promise<{ path: string; written: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/permissions.yaml');
    const current = (await readYaml<{ allow?: string[]; deny?: string[]; ask?: string[] }>(
      ctx.projectRoot,
      path,
    )) ?? {
      allow: [],
      deny: [],
      ask: [],
    };
    const next = { ...current };
    const apply = (k: 'allow' | 'deny' | 'ask', v: string[] | undefined): void => {
      if (v === undefined) return;
      next[k] = input.mode === 'append' ? Array.from(new Set([...(current[k] ?? []), ...v])) : v;
    };
    apply('allow', input.allow);
    apply('deny', input.deny);
    apply('ask', input.ask);
    if (input.dry_run === true) return { path, written: false };
    await atomicWrite(ctx.projectRoot, path, stringifyYaml(next));
    return { path, written: true };
  },

  async updateHooks(
    ctx: McpContext,
    input: { hooks: Record<string, unknown[]>; dry_run?: boolean },
  ): Promise<{ path: string; written: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/hooks.yaml');
    if (input.dry_run === true) return { path, written: false };
    // Flatten the nested native form to the flat canonical shape so parseHooks
    // can recover it; a verbatim nested write is silently dropped on generate.
    await atomicWrite(ctx.projectRoot, path, stringifyYaml(normalizeHooksRecord(input.hooks)));
    return { path, written: true };
  },

  async updateIgnore(
    ctx: McpContext,
    input: { patterns: string[]; mode?: 'replace' | 'append'; dry_run?: boolean },
  ): Promise<{ path: string; written: boolean }> {
    const path = resolve(ctx.projectRoot, '.agentsmesh/ignore');
    let next: string[];
    if (input.mode === 'append') {
      await assertWithinProject(ctx.projectRoot, path);
      const cur = (await readFile(path, 'utf8').catch(() => '')).split(/\r?\n/).filter(Boolean);
      next = Array.from(new Set([...cur, ...input.patterns]));
    } else {
      next = input.patterns;
    }
    if (input.dry_run === true) return { path, written: false };
    await atomicWrite(ctx.projectRoot, path, next.join('\n') + '\n');
    return { path, written: true };
  },
};
