import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { JULES_TARGET } from './constants.js';

export const lintRules = createRuleLinter(JULES_TARGET);
