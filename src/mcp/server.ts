import { getVersion } from '../cli/version.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DESCRIPTORS, RESOURCE_DESCRIPTORS, zodToMcpSchema } from './register.js';
import { resolveContext } from './context.js';
import { readResource, toMcpError } from './resources.js';
import { McpError } from './errors.js';
import { enrichValidationIssues } from './validation-errors.js';

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: 'agentsmesh-mcp', version: getVersion() },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DESCRIPTORS.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: zodToMcpSchema(d.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const desc = TOOL_DESCRIPTORS.find((d) => d.name === req.params.name);
    if (!desc) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              code: 'NOT_FOUND',
              message: `unknown tool: ${req.params.name}`,
            }),
          },
        ],
      };
    }
    try {
      const parsed = desc.inputSchema.safeParse(req.params.arguments ?? {});
      if (!parsed.success) {
        const details = enrichValidationIssues(desc.inputSchema, parsed.error.issues);
        throw new McpError('VALIDATION_FAILED', 'invalid input', details);
      }
      const ctx = await resolveContext({
        cwd: process.cwd(),
        requireProject: desc.projectOptional !== true,
      });
      const result = await desc.handler(ctx, parsed.data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (e) {
      const env = toMcpError(e).toEnvelope();
      return {
        isError: true,
        content: [{ type: 'text' as const, text: JSON.stringify(env) }],
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCE_DESCRIPTORS.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const data = await readResource(RESOURCE_DESCRIPTORS, req.params.uri, () =>
      resolveContext({ cwd: process.cwd() }),
    );
    return {
      contents: [{ uri: req.params.uri, mimeType: 'application/json', text: JSON.stringify(data) }],
    };
  });

  await server.connect(new StdioServerTransport());
}
