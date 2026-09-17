/**
 * Cline target linter — validates canonical files for Cline.
 */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { CLINE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(CLINE_TARGET);
