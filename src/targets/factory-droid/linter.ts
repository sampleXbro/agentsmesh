import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { FACTORY_DROID_TARGET } from './constants.js';

export const lintRules = createRuleLinter(FACTORY_DROID_TARGET);
