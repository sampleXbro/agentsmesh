import { z } from 'zod';
import { settingsHandlers } from '../handlers/settings.js';
import { HooksRecordSchema, McpServerInputSchema, PermissionListSchema } from '../schemas.js';
import type { ToolDescriptor } from './types.js';

const NoInput = z.object({}).strict();

const READ_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'get_config',
    description: 'Read agentsmesh.yaml',
    inputSchema: NoInput,
    handler: (ctx) => settingsHandlers.getConfig(ctx),
    resourceUri: 'agentsmesh://config',
  },
  {
    name: 'list_mcp_servers',
    description: 'List MCP servers in canonical mcp.json',
    inputSchema: NoInput,
    handler: (ctx) => settingsHandlers.listMcpServers(ctx),
    resourceUri: 'agentsmesh://canonical/mcp',
  },
  {
    name: 'get_permissions',
    description: 'Read permissions.yaml',
    inputSchema: NoInput,
    handler: (ctx) => settingsHandlers.getPermissions(ctx),
    resourceUri: 'agentsmesh://canonical/permissions',
  },
  {
    name: 'get_hooks',
    description: 'Read hooks.yaml',
    inputSchema: NoInput,
    handler: (ctx) => settingsHandlers.getHooks(ctx),
    resourceUri: 'agentsmesh://canonical/hooks',
  },
  {
    name: 'get_ignore',
    description: 'Read ignore patterns',
    inputSchema: NoInput,
    handler: (ctx) => settingsHandlers.getIgnore(ctx),
    resourceUri: 'agentsmesh://canonical/ignore',
  },
];

const WRITE_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'update_config',
    description:
      'Update agentsmesh.yaml. Default: replace listed fields. Set merge=true to union arrays and shallow-merge objects. Only writes agentsmesh.yaml, never agentsmesh.local.yaml.',
    inputSchema: z.object({
      targets: z
        .array(z.string())
        .optional()
        .describe('Target tool IDs (e.g. ["claude-code", "cursor"])'),
      features: z
        .array(z.string())
        .optional()
        .describe('Feature names (e.g. ["rules", "commands", "mcp"])'),
      conversions: z.record(z.string(), z.unknown()).optional().describe('Conversion overrides'),
      merge: z
        .boolean()
        .optional()
        .describe('If true, union arrays and shallow-merge objects instead of replacing'),
      dry_run: z.boolean().optional().describe('Preview without writing'),
    }),
    handler: (ctx, i) => settingsHandlers.updateConfig(ctx, i as never),
  },
  {
    name: 'add_mcp_server',
    description: 'Add an MCP server entry to .agentsmesh/mcp.json. Fails if name already exists.',
    inputSchema: z.object({
      name: z.string().describe('Server name (e.g. "github", "filesystem")'),
      server: McpServerInputSchema.describe(
        'Server config (e.g. { type: "stdio", command: "npx", args: [...], env: {...} })',
      ),
      dry_run: z.boolean().optional().describe('Preview without writing'),
    }),
    handler: (ctx, i) => settingsHandlers.addMcpServer(ctx, i as never),
  },
  {
    name: 'update_mcp_server',
    description: 'Update an MCP server entry (replace or merge)',
    inputSchema: z.object({
      name: z.string(),
      server: McpServerInputSchema,
      merge: z.boolean().optional(),
      dry_run: z.boolean().optional(),
    }),
    handler: (ctx, i) => settingsHandlers.updateMcpServer(ctx, i as never),
  },
  {
    name: 'remove_mcp_server',
    description: 'Remove an MCP server entry',
    inputSchema: z.object({ name: z.string(), dry_run: z.boolean().optional() }),
    handler: (ctx, i) => settingsHandlers.removeMcpServer(ctx, i as never),
  },
  {
    name: 'update_permissions',
    description:
      'Update permissions.yaml. mode=replace (default) overwrites listed fields; mode=append unions and dedups. A list left out is not written, so a missing list stays unmanaged.',
    inputSchema: z.object({
      allow: PermissionListSchema.optional().describe(
        'Allowed tool patterns (e.g. ["Bash(npm run:*)"])',
      ),
      deny: PermissionListSchema.optional().describe('Denied tool patterns'),
      ask: PermissionListSchema.optional().describe('Tools requiring confirmation'),
      mode: z
        .enum(['replace', 'append'])
        .optional()
        .describe('replace=overwrite, append=union+dedup (default: replace)'),
      dry_run: z.boolean().optional().describe('Preview without writing'),
    }),
    handler: (ctx, i) => settingsHandlers.updatePermissions(ctx, i as never),
  },
  {
    name: 'update_hooks',
    description:
      'Replace hooks.yaml content entirely. Read current hooks with get_hooks, modify, then write back.',
    inputSchema: z.object({
      hooks: HooksRecordSchema.describe(
        'Full hooks structure (e.g. { PreToolUse: [...], PostToolUse: [...] })',
      ),
      dry_run: z.boolean().optional().describe('Preview without writing'),
    }),
    handler: (ctx, i) => settingsHandlers.updateHooks(ctx, i as never),
  },
  {
    name: 'update_ignore',
    description:
      'Update .agentsmesh/ignore patterns. mode=replace (default) overwrites; mode=append adds new patterns.',
    inputSchema: z.object({
      patterns: z
        .array(z.string())
        .describe('Gitignore-syntax patterns (e.g. ["node_modules/", "dist/", ".env*"])'),
      mode: z
        .enum(['replace', 'append'])
        .optional()
        .describe('replace=overwrite, append=add (default: replace)'),
      dry_run: z.boolean().optional().describe('Preview without writing'),
    }),
    handler: (ctx, i) => settingsHandlers.updateIgnore(ctx, i as never),
  },
];

export const SETTINGS_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  ...READ_DESCRIPTORS,
  ...WRITE_DESCRIPTORS,
];
