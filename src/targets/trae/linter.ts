import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { TRAE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(TRAE_TARGET);
