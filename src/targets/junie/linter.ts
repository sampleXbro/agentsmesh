import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { JUNIE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(JUNIE_TARGET);
