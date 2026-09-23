/**
 * A captured file glob must be project-relative: recall matches globs against
 * project-relative paths, so an absolute glob is stored and then never fires.
 */

import { describe, expect, it } from 'vitest';
import { mergeTriggers } from '../../../src/lessons/add-helpers.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { TriggerFileGlobError } from '../../../src/lessons/trigger-file-glob.js';

const emptyGraph = (): LessonsGraph => ({ version: 2, lessons: {}, topics: {}, triggers: {} });

function storedPatterns(graph: LessonsGraph): string[] {
  return Object.values(graph.triggers).map((t) => t.pattern);
}

describe('mergeTriggers — file globs are stored project-relative', () => {
  it('relativizes an absolute glob inside the project root', () => {
    const graph = emptyGraph();
    mergeTriggers(graph, { files: ['/proj/src/lessons/**/*.ts'] }, '/proj');
    expect(storedPatterns(graph)).toEqual(['src/lessons/**/*.ts']);
  });

  it('relativizes a Windows-shaped absolute glob inside the project root', () => {
    const graph = emptyGraph();
    mergeTriggers(graph, { files: ['C:\\proj\\src\\x.ts'] }, 'C:/proj');
    expect(storedPatterns(graph)).toEqual(['src/x.ts']);
  });

  it('dedupes a relativized glob against the relative node it equals', () => {
    const graph = emptyGraph();
    const first = mergeTriggers(graph, { files: ['src/x.ts'] }, '/proj');
    const second = mergeTriggers(graph, { files: ['/proj/src/x.ts'] }, '/proj');
    expect(second.triggerIds).toEqual(first.triggerIds);
    expect(second.newTriggerIds).toEqual([]);
  });

  it('rejects an absolute glob outside the project root', () => {
    const graph = emptyGraph();
    expect(() => mergeTriggers(graph, { files: ['/elsewhere/x.ts'] }, '/proj')).toThrow(
      TriggerFileGlobError,
    );
    expect(storedPatterns(graph)).toEqual([]);
  });

  it('rejects the project root itself (an empty relative glob)', () => {
    expect(() => mergeTriggers(emptyGraph(), { files: ['/proj'] }, '/proj')).toThrow(
      TriggerFileGlobError,
    );
  });

  it('keeps relative globs unchanged, with backslashes normalized', () => {
    const graph = emptyGraph();
    mergeTriggers(graph, { files: ['src\\**\\*.ts', '**/*.md'] }, '/proj');
    expect(storedPatterns(graph)).toEqual(['src/**/*.ts', '**/*.md']);
  });

  it('without a project root stores globs as given (legacy callers)', () => {
    const graph = emptyGraph();
    mergeTriggers(graph, { files: ['/abs/x.ts'] });
    expect(storedPatterns(graph)).toEqual(['/abs/x.ts']);
  });

  it('carries a machine code for CLI and MCP surfacing', () => {
    try {
      mergeTriggers(emptyGraph(), { files: ['/elsewhere/x.ts'] }, '/proj');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TriggerFileGlobError);
      expect((err as TriggerFileGlobError).code).toBe('TRIGGER_FILE_OUTSIDE_PROJECT');
      expect((err as TriggerFileGlobError).message).toContain('/elsewhere/x.ts');
    }
  });
});
