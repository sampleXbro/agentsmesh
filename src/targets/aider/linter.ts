import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { AIDER_TARGET } from './constants.js';

export const lintRules = createRuleLinter(AIDER_TARGET);
