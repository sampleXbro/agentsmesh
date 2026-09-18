/**
 * `globalSupport.scopeExtras` for Trae.
 *
 * `~/.trae/permission/global.json` is global-only — Trae documents no
 * project-tier permission file — so `globalOnly` gates the scope.
 */

import { globalOnly } from '../catalog/target-descriptor.js';
import { generateTraeGlobalPermissions } from './global-permissions.js';

export const traeScopeExtras = globalOnly(generateTraeGlobalPermissions);
