import { createRuleLinter } from '../../core/lint/rule-linter.js';
import { REPLIT_AGENT_TARGET } from './constants.js';

export const lintRules = createRuleLinter(REPLIT_AGENT_TARGET);
