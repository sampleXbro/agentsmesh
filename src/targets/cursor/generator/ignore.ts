import { CURSOR_IGNORE } from '../constants.js';
import { ignoreOutput } from '../../catalog/ignore-output.js';
import type { CanonicalFiles } from '../../../core/types.js';
import type { GenerateFeatureContext } from '../../catalog/target.interface.js';

const projectIgnore = ignoreOutput(CURSOR_IGNORE);
export function generateIgnore(canonical: CanonicalFiles, ctx?: GenerateFeatureContext): ReturnType<typeof projectIgnore> {
  return ctx?.scope === 'global' ? [] : projectIgnore(canonical);
}
