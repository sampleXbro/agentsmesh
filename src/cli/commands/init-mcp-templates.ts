/**
 * `.agentsmesh/mcp.json` templates for agentsmesh init.
 */

import type { ConfigScope } from '../../config/core/scope.js';

export const TEMPLATE_MCP = `{
  "mcpServers": {
    // agentsmesh self-serve MCP server — exposes your canonical config to AI agents.
    // Lets agents introspect rules/commands/agents/skills and trigger generate.
    // Docs: https://samplexbro.github.io/agentsmesh/reference/mcp-server/
    // For faster startup, install agentsmesh as a devDependency and replace the entry below with:
    //   "command": "agentsmesh", "args": ["mcp"]
    // Remove this entry to disable.
    "agentsmesh": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agentsmesh", "mcp"]
    }

    // "github": {
    //   "type": "stdio",
    //   "command": "npx",
    //   "args": ["-y", "@modelcontextprotocol/server-github"],
    //   "env": { "GITHUB_TOKEN": "$GITHUB_TOKEN" }
    // },
    // "filesystem": {
    //   "type": "stdio",
    //   "command": "npx",
    //   "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"]
    // }
  }
}
`;

// The self-serve MCP server is project-only. "mcpServers" is commented out, not
// scaffolded empty: an empty object would clear the servers a tool already has
// in its global config.
export const TEMPLATE_MCP_GLOBAL = `{
  // Uncomment to start managing MCP servers. An empty "mcpServers" object is a
  // real instruction — "no servers" — not a placeholder.
  //
  // "mcpServers": {
  //   "github": {
  //     "type": "stdio",
  //     "command": "npx",
  //     "args": ["-y", "@modelcontextprotocol/server-github"],
  //     "env": { "GITHUB_TOKEN": "$GITHUB_TOKEN" }
  //   },
  //   "filesystem": {
  //     "type": "stdio",
  //     "command": "npx",
  //     "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"]
  //   }
  // }
}
`;

export function mcpTemplate(scope: ConfigScope): string {
  return scope === 'global' ? TEMPLATE_MCP_GLOBAL : TEMPLATE_MCP;
}
