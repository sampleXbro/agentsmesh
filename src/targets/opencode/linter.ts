import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { OPENCODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(OPENCODE_TARGET);
