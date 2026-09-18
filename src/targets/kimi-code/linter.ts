/** Lint rules for the kimi-code target. */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { KIMI_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(KIMI_CODE_TARGET);
