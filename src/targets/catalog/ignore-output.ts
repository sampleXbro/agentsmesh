import type { FeatureGeneratorFn } from './target.interface.js';

/**
 * Generator for a target whose ignore support is one native file holding the
 * canonical patterns verbatim. Fifteen targets wrote the same four lines with
 * only the path constant changed; this is those four lines once, the way
 * `NO_OUTPUTS` is a single `return []` instead of one stub per target.
 *
 * Targets that gate the file by scope, or reshape the patterns on the way out,
 * keep their own generator — this covers the verbatim case only, so it takes a
 * path and nothing else.
 */
export function ignoreOutput(path: string): FeatureGeneratorFn {
  return (canonical) =>
    canonical.ignore.length === 0 ? [] : [{ path, content: canonical.ignore.join('\n') }];
}
