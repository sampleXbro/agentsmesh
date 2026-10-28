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
// scaffolded empty: an empty object makes some tools clear their global servers.
export const TEMPLATE_MCP_GLOBAL = `{
  // MCP servers are not managed here yet, so generate --global does not touch
  // the MCP servers in your tools' global config. To manage them here, first run
  // agentsmesh import --global --from <tool> to copy in the servers you already
  // have: once servers are listed, generate --global writes this list to your
  // tools and can drop servers that are not in it. Never leave "mcpServers" as
  // an empty object: for some tools that clears every global MCP server.
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
