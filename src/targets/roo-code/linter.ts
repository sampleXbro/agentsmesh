import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { ROO_CODE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(ROO_CODE_TARGET);
