import type { FeatureGeneratorFn } from './target.interface.js';

/**
 * Generator for a capability a target declares at a non-`none` level but emits
 * no file for (the value is carried by another output, or projected elsewhere).
 * `validateCapabilityImplementations` requires a function to be present; this is
 * that function, once, instead of a `return []` stub per target per feature.
 */
export const NO_OUTPUTS: FeatureGeneratorFn = () => [];
