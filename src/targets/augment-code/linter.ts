import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { AUGMENT_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(AUGMENT_CODE_TARGET);
