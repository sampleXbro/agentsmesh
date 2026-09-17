import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { WARP_TARGET } from './constants.js';

export const lintRules = createRuleLinter(WARP_TARGET);
