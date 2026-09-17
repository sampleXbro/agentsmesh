import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { PI_AGENT_TARGET } from './constants.js';

export const lintRules = createRuleLinter(PI_AGENT_TARGET);
