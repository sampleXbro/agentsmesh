import type { CanonicalFiles } from '../../core/types.js';

/** A canonical slice with every feature empty — the base every loader accumulates into. */
export function emptyCanonical(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}
