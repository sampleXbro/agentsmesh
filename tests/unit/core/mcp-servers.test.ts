import { describe, expect, it } from 'vitest';
import type { McpServer } from '../../../src/core/types.js';
import { isStdioMcpServer, isUrlMcpServer } from '../../../src/core/mcp-servers.js';

function stdioServer(overrides: Partial<Extract<McpServer, { command: string }>> = {}): McpServer {
  return {
    type: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: {},
    ...overrides,
  };
}

function urlServer(overrides: Partial<Extract<McpServer, { url: string }>> = {}): McpServer {
  return {
    type: 'http',
    url: 'https://example.test/mcp',
    headers: {},
    env: {},
    ...overrides,
  };
}

describe('mcp-servers', () => {
  it('identifies stdio servers', () => {
    const server = stdioServer();
    expect(isStdioMcpServer(server)).toBe(true);
    expect(isUrlMcpServer(server)).toBe(false);
  });

  it('identifies url servers', () => {
    const server = urlServer();
    expect(isUrlMcpServer(server)).toBe(true);
    expect(isStdioMcpServer(server)).toBe(false);
  });
});
