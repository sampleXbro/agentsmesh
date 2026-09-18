import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { KIRO_TARGET } from './constants.js';

export const lintRules = createRuleLinter(KIRO_TARGET);
