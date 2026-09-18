/**
 * Cursor target linter — validates canonical files for Cursor.
 */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { CURSOR_TARGET } from './constants.js';

export const lintRules = createRuleLinter(CURSOR_TARGET);
