/**
 * Crush-specific lint hooks.
 *
 * Crush does not support dedicated commands as slash-commands;
 * use supportsConversion to project commands/agents as skills instead.
 * Permissions in crush.json use permissions.allowed_tools (allow list) and
 * options.disabled_tools (deny list) — native round-trip supported.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';

export const lintCommands = unsupportedFeature(
  'commands',
  'crush',
  'Crush has no native slash-command format; commands are projected as skills via supportsConversion.',
);
