/**
 * Kilo Code-specific lint hooks.
 *
 * Kilo supports hooks only via auto-loaded plugins (`.kilo/plugin/*.{ts,js}`),
 * which agentsmesh does not generate — so canonical hooks cannot be projected
 * and a warning surfaces the gap to users.
 *
 * Permissions are natively supported via `kilo.jsonc` (`permission` key) and
 * do not require a lint warning.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';

export const lintHooks = unsupportedFeature(
  'hooks',
  'kilo-code',
  'Kilo Code hooks are supported via auto-loaded plugins at .kilo/plugin/*.{ts,js}; agentsmesh does not generate plugin files yet. Configure hooks manually.',
);
