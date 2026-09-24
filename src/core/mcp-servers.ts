import type { McpServer, StdioMcpServer, UrlMcpServer } from './types.js';

export function isStdioMcpServer(server: McpServer): server is StdioMcpServer {
  return 'command' in server;
}

export function isUrlMcpServer(server: McpServer): server is UrlMcpServer {
  return 'url' in server;
}
