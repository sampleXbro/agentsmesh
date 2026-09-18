/**
 * `globalSupport.scopeExtras` for Warp.
 *
 * `~/.warp/settings.toml` is global-only — Warp documents no project-tier
 * settings file — so `globalOnly` gates the scope.
 */

import { globalOnly } from '../catalog/target-descriptor.js';
import { generateWarpGlobalPermissions } from './global-permissions.js';

export const warpScopeExtras = globalOnly(generateWarpGlobalPermissions);
