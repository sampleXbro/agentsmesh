/** Lint rules for the deepagents-cli target. */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { DEEPAGENTS_CLI_TARGET } from './constants.js';

export const lintRules = createRuleLinter(DEEPAGENTS_CLI_TARGET);
