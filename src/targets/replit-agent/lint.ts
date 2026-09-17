/**
 * Replit Agent-specific lint hooks.
 *
 * Replit Agent does not support hooks, permissions, ignore, or MCP
 * as standalone config files. Commands and agents are projected as
 * skills via supportsConversion.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';

export const lintHooks = unsupportedFeature(
  'hooks',
  'replit-agent',
  'Replit Agent has no lifecycle hook system; canonical hooks are not projected.',
);

export const lintPermissions = unsupportedFeature(
  'permissions',
  'replit-agent',
  'Replit Agent permissions are managed in the cloud UI; canonical permissions are not projected.',
);

export const lintIgnore = unsupportedFeature(
  'ignore',
  'replit-agent',
  'Replit Agent has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);

export const lintMcp = unsupportedFeature(
  'mcp',
  'replit-agent',
  'Replit Agent MCP servers are configured via the Integrations UI, not file-based; canonical MCP config is not projected.',
);
