import { GEMINI_IGNORE } from '../constants.js';
import { ignoreOutput } from '../../catalog/ignore-output.js';

export const generateIgnore = ignoreOutput(GEMINI_IGNORE);
