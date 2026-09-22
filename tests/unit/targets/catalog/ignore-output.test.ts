/**
 * Fifteen targets wrote the same ignore generator with only the path changed:
 * bail on an empty list, otherwise join the canonical patterns with newlines and
 * write them to one native file. This is those four lines once, in the shape the
 * catalog already uses for `NO_OUTPUTS`.
 *
 * Targets that gate the file by scope (cline, augment-code, roo-code, continue
 * suppress it in global scope) or reshape the patterns keep their own generator.
 * This covers the verbatim case only, so the factory takes no options.
 */

import { describe, it, expect } from 'vitest';
import { ignoreOutput } from '../../../../src/targets/catalog/ignore-output.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

function canonical(ignore: string[]): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore,
  } as unknown as CanonicalFiles;
}

describe('ignoreOutput', () => {
  it('writes every pattern to the given path, newline separated', () => {
    const generate = ignoreOutput('.aiderignore');
    expect(generate(canonical(['node_modules', 'dist', '*.log']))).toEqual([
      { path: '.aiderignore', content: 'node_modules\ndist\n*.log' },
    ]);
  });

  it('emits nothing when there are no patterns, so no empty file is written', () => {
    expect(ignoreOutput('.aiderignore')(canonical([]))).toEqual([]);
  });

  it('writes a single pattern without a trailing newline', () => {
    expect(ignoreOutput('.crushignore')(canonical(['dist']))).toEqual([
      { path: '.crushignore', content: 'dist' },
    ]);
  });

  it('binds the path per call, so two targets never share one', () => {
    const list = canonical(['dist']);
    expect(ignoreOutput('.a')(list)[0]!.path).toBe('.a');
    expect(ignoreOutput('.b')(list)[0]!.path).toBe('.b');
  });
});
