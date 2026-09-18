/** Lint rules for the rovodev target. */

import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { ROVODEV_TARGET } from './constants.js';

export const lintRules = createRuleLinter(ROVODEV_TARGET);
