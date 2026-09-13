import { readFile } from 'node:fs/promises';
import { McpError } from '../errors.js';
import { assertWithinProject } from './settings-file.js';
import { stripJsonComments } from '../../utils/text/json-comments.js';

interface McpDocument extends Record<string, unknown> {
  mcpServers: Record<string, Record<string, unknown>>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function readMcpDocument(
  projectRoot: string,
  path: string,
): Promise<McpDocument | null> {
  await assertWithinProject(projectRoot, path);
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new McpError('IO_ERROR', 'failed to read MCP configuration');
  }
  let document: unknown;
  try {
    document = JSON.parse(stripJsonComments(content.replace(/^\uFEFF/, '')));
  } catch {
    throw new McpError('VALIDATION_FAILED', 'invalid existing MCP configuration');
  }
  if (
    !isObject(document) ||
    (document.mcpServers !== undefined && !isObject(document.mcpServers))
  ) {
    throw new McpError('VALIDATION_FAILED', 'invalid existing MCP configuration');
  }
  const entries = Object.entries(document.mcpServers ?? {});
  const servers: Record<string, Record<string, unknown>> = {};
  for (const [name, server] of entries) {
    if (!isObject(server)) throw new McpError('VALIDATION_FAILED', 'invalid existing MCP server');
    Object.defineProperty(servers, name, {
      value: server,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { ...document, mcpServers: servers };
}
