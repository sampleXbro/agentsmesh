/**
 * Goose capability levels per scope.
 *
 * Both MCP cells are `native` but land in different files: project scope writes
 * `.agents/plugins/agentsmesh/.mcp.json` (Open Plugin MCP loader, stdio only —
 * remote servers are named by `lintMcp`), global scope the `extensions` block of
 * `~/.config/goose/config.yaml`, which carries every transport.
 *
 * Permissions are `partial` at project scope because goose reads tool
 * permissions from `~/.config/goose/permission.yaml` alone.
 */

import type { TargetCapabilities } from '../catalog/target.interface.js';

export const projectCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'embedded',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'none',
  permissions: 'none',
};

export const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'embedded',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'none',
  permissions: 'native',
};
