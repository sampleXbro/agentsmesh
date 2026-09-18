import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { GOOSE_TARGET } from './constants.js';

export const lintRules = createRuleLinter(GOOSE_TARGET);
