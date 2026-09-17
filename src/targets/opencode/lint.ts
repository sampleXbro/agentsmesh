/**
 * OpenCode-specific lint hooks.
 *
 * OpenCode hooks are plugin-based (TypeScript/JavaScript lifecycle events),
 * not config-based. agentsmesh cannot generate plugin code from canonical hooks.
 *
 * Ignore is generated into `opencode.json` as `permission.read`/`permission.edit`
 * path deny rules, which OpenCode enforces per file path. `grep` and `glob`
 * rules match the search string instead of the resolved path, so those tools
 * stay unrestricted — the one fidelity gap worth warning about.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';

export const lintHooks = unsupportedFeature(
  'hooks',
  'opencode',
  'OpenCode hooks are supported via auto-loaded plugins at .opencode/plugins/; agentsmesh does not generate plugin files yet. Configure hooks manually.',
);

export const lintIgnore = unsupportedFeature(
  'ignore',
  'opencode',
  'opencode ignore patterns are projected as permission.read/permission.edit deny rules in opencode.json. OpenCode matches grep and glob rules against the search string, not the file path, so ignored files can still surface in search results.',
);
