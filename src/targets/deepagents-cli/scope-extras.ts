/**
 * `globalSupport.scopeExtras` for Deep Agents CLI.
 *
 * Both extra surfaces are global-only — `~/.deepagents/hooks.json` and
 * `~/.deepagents/config.toml` have no project-tier equivalent — so `globalOnly`
 * gates the scope for both emitters.
 */

import { globalOnly } from '../catalog/target-descriptor.js';
import { generateDeepagentsCliGlobalHooks } from './global-hooks.js';
import { generateDeepagentsCliGlobalPermissions } from './global-permissions.js';

export const deepagentsCliScopeExtras = globalOnly(
  generateDeepagentsCliGlobalHooks,
  generateDeepagentsCliGlobalPermissions,
);
