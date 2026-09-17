/**
 * Amp-specific lint hooks.
 *
 * Amp has no dedicated ignore file and relies on .gitignore. Amp also has no
 * declarative settings-file hook mechanism (only the plugin-based `amp.on(...)`
 * event API, which is code agentsmesh cannot own) — see ampcode.com/manual.
 *
 * amp.permissions is a legacy key (ampcode.com/manual/appendix/legacy-permissions-rules.txt).
 * Its documented schema is an array of rule objects, which is incompatible with the
 * canonical {allow,deny,ask} string-array structure. AgentsMesh cannot safely emit a
 * valid amp.permissions value, so permissions capability is 'partial' and a lint
 * warning is emitted when canonical permissions are present.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

export const lintIgnore = unsupportedFeature(
  'ignore',
  'amp',
  'Amp has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);

export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow, deny, ask } = canonical.permissions;
  const hasEntries = allow.length > 0 || deny.length > 0 || (ask?.length ?? 0) > 0;
  if (!hasEntries) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'amp',
      'amp.permissions is a legacy key (see ampcode.com/manual/appendix/legacy-permissions-rules.txt) whose schema requires an array of rule objects, not the canonical allow/deny/ask format. Canonical permissions are not projected to Amp.',
    ),
  ];
}

export const lintHooks = unsupportedFeature(
  'hooks',
  'amp',
  'Amp hooks are partially supported via the plugin-based amp.on(...) event API; declarative hook config is not generated.',
);
