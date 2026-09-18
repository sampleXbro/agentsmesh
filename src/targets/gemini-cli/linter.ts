/**
 * Gemini CLI target linter — validates canonical files for Gemini CLI.
 */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { GEMINI_TARGET } from './constants.js';

export const lintRules = createRuleLinter(GEMINI_TARGET);
