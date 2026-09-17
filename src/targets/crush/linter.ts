import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { CRUSH_TARGET } from './constants.js';

export const lintRules = createRuleLinter(CRUSH_TARGET);
