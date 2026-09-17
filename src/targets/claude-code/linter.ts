/**
 * Claude Code target linter — validates canonical files for Claude Code.
 */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { CLAUDE_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(CLAUDE_CODE_TARGET);
