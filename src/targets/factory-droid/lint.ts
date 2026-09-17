/**
 * Factory Droid-specific lint warnings.
 *
 * Factory Droid has no dedicated ignore file (relies on .gitignore). Hooks are
 * natively supported via .factory/hooks.json. Permissions are natively supported
 * via commandAllowlist/commandDenylist in .factory/settings.json.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';

export const lintIgnore = unsupportedFeature(
  'ignore',
  'factory-droid',
  'Factory Droid has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);
