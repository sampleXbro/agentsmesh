/** Lint rules for the qwen-code target. */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { QWEN_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(QWEN_CODE_TARGET);
