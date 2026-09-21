import type { z } from 'zod';
import type { McpContext } from '../context.js';

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (ctx: McpContext, input: unknown) => Promise<unknown>;
  resourceUri?: string;
  /**
   * The tool works in a directory with no `agentsmesh.yaml`. Lessons are
   * self-contained — the CLI already recalls and captures in a bare repo — so
   * requiring a project on the MCP surface only locked out agents with no
   * shell. Config tools leave this unset and still require a project.
   */
  projectOptional?: boolean;
}

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  /** Validates the template params before `read` runs (same schema as the tool). */
  inputSchema: z.ZodTypeAny;
  read: (ctx: McpContext, params: Record<string, string>) => Promise<unknown>;
}
