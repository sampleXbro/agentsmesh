import type { CanonicalFiles } from '../../../src/core/types.js';

/** Empty canonical files, with `overrides` on top. */
export function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}
