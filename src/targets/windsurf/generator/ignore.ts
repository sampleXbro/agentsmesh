import { CODEIUM_IGNORE } from '../constants.js';
import { ignoreOutput } from '../../catalog/ignore-output.js';

export const generateIgnore = ignoreOutput(CODEIUM_IGNORE);
