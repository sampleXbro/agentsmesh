import { z } from 'zod';
import { capabilitiesHandlers } from '../handlers/capabilities.js';
import { orchestrateHandlers } from '../handlers/orchestrate.js';
import type { ToolDescriptor } from './types.js';

const NoInput = z.object({}).strict();

export const ORCHESTRATE_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'list_target_capabilities',
    description: 'List support matrix for all targets',
    inputSchema: NoInput,
    handler: () => capabilitiesHandlers.list(),
    resourceUri: 'agentsmesh://capabilities',
  },
  {
    name: 'get_target_capabilities',
    description:
      'Get feature support levels for a specific target (e.g. which features are native, mapped, or unsupported)',
    inputSchema: z.object({
      targetId: z.string().describe('Target tool ID (e.g. "claude-code", "cursor")'),
    }),
    handler: (_, i) => capabilitiesHandlers.get(i as never),
    resourceUri: 'agentsmesh://capabilities/{targetId}',
  },
  {
    name: 'generate',
    description:
      'Generate target-native config files from canonical .agentsmesh/ content. Propagates rules, commands, agents, skills, MCP, hooks, ignore, and permissions to all configured targets.',
    inputSchema: z
      .object({
        targets: z
          .array(z.string())
          .optional()
          .describe('Filter to specific targets (default: all from agentsmesh.yaml)'),
        verbose: z.boolean().optional().describe('Include full file list in response'),
        dry_run: z.boolean().optional().describe('Preview without writing files'),
      })
      .strict(),
    handler: (ctx, i) => orchestrateHandlers.generate(ctx, i as never),
  },
  {
    name: 'lint',
    description:
      'Lint canonical .agentsmesh/ files for schema errors, missing frontmatter, and other issues',
    inputSchema: z.object({
      severity: z
        .enum(['error', 'warning', 'info'])
        .optional()
        .describe('Filter results by minimum severity'),
    }),
    handler: (ctx, i) => orchestrateHandlers.lint(ctx, i as never),
  },
  {
    name: 'check',
    description:
      'Detect canonical and generated-output drift, including hand-edits and stale files in managed output locations (outputsChecked is false for old-format locks without an outputs map; lockConflict is true when the lock has git conflict markers, fixed by agentsmesh merge)',
    inputSchema: NoInput,
    handler: (ctx) => orchestrateHandlers.check(ctx),
  },
  {
    name: 'diff',
    description: 'Preview what generate would create, modify, or delete without writing',
    inputSchema: z
      .object({
        targets: z.array(z.string()).optional().describe('Filter to specific targets'),
      })
      .strict(),
    handler: (ctx, i) => orchestrateHandlers.diff(ctx, i as never),
  },
  {
    name: 'import',
    description:
      "Import another tool's native config into canonical .agentsmesh/. Note: dry_run is not supported (the engine writes directly).",
    inputSchema: z.object({
      from: z.string().describe('Source target ID to import from (e.g. "cursor", "claude-code")'),
      features: z.array(z.string()).optional().describe('Restrict import to specific features'),
      dry_run: z
        .boolean()
        .optional()
        .describe('NOT SUPPORTED — will throw VALIDATION_FAILED. Use diff instead.'),
    }),
    handler: (ctx, i) => orchestrateHandlers.import(ctx, i as never),
  },
  {
    name: 'convert',
    description:
      'Convert config directly from one tool to another (e.g. Cursor → Claude Code) without creating canonical .agentsmesh/ files',
    inputSchema: z.object({
      from: z.string().describe('Source target ID (e.g. "cursor")'),
      to: z.string().describe('Destination target ID (e.g. "claude-code")'),
      dry_run: z.boolean().optional().describe('Preview conversion without writing files'),
    }),
    handler: (ctx, i) => orchestrateHandlers.convert(ctx, i as never),
  },
];
