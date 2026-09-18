import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { AMP_TARGET } from './constants.js';

export const lintRules = createRuleLinter(AMP_TARGET);
