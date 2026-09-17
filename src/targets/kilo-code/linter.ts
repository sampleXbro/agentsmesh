/** Lint canonical rules for the kilo-code target. */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { KILO_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(KILO_CODE_TARGET);
