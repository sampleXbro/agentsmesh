import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonsWriteRefusedError } from '../../../src/lessons/mutate.js';

/**
 * Every write handler maps a thrown error the same way: the message, the exit
 * code (2 for a refused write, else 1) and the error's own `code` when it has
 * one. The lessons library is mocked so each handler throws what we choose.
 */

const thrown = vi.hoisted(() => ({ err: undefined as unknown }));

async function boom(): Promise<never> {
  throw thrown.err;
}

vi.mock('../../../src/lessons/deprecate.js', () => ({ deprecateLesson: vi.fn(boom) }));
vi.mock('../../../src/lessons/merge.js', () => ({ mergeLessons: vi.fn(boom) }));
vi.mock('../../../src/lessons/strip-markers.js', () => ({ stripMarkersInGraph: vi.fn(boom) }));
vi.mock('../../../src/lessons/mutate.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lessons/mutate.js')>()),
  mutateLessonsGraph: vi.fn(boom),
}));

const { doDeprecate } = await import('../../../src/cli/commands/lessons-write-handlers.js');
const { doMerge, doStripMarkers, doUntrigger } =
  await import('../../../src/cli/commands/lessons-curation-handlers.js');

class CodedError extends Error {
  readonly code = 'SOME_CODE';
}

const refusal = (): LessonsWriteRefusedError =>
  new LessonsWriteRefusedError([{ level: 'error', code: 'BAD', message: 'Bad graph.' }]);

const ROOT = '/tmp/unused-amesh-root';

const handlers = {
  deprecate: () => doDeprecate({}, 'a', ROOT),
  merge: () => doMerge('a', 'b', ROOT),
  untrigger: () => doUntrigger('a', 't', ROOT),
  'strip-markers': () => doStripMarkers({}, ROOT),
};

beforeEach(() => {
  thrown.err = undefined;
});

describe.each(Object.entries(handlers))('lessons %s failure mapping', (subcommand, run) => {
  it('carries the code of a coded error and exits 1', async () => {
    thrown.err = new CodedError('coded failure');
    const r = await run();
    expect(r.subcommand).toBe(subcommand);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('coded failure');
    expect(r.code).toBe('SOME_CODE');
  });

  it('gives an uncoded error no code and exits 1', async () => {
    thrown.err = new Error('plain failure');
    const r = await run();
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('plain failure');
    expect(r).not.toHaveProperty('code');
  });

  it('exits 2 when the validator refused the write', async () => {
    thrown.err = refusal();
    const r = await run();
    expect(r.exitCode).toBe(2);
    expect(r.error).toContain('Refused to save the lessons graph');
    expect(r).not.toHaveProperty('code');
  });
});

describe('lessons strip-markers failure data', () => {
  it('returns the empty report for a real run', async () => {
    thrown.err = new Error('lock timeout');
    const r = await doStripMarkers({}, ROOT);
    expect(r.data).toEqual({ changedIds: [], changedCount: 0, dryRun: false });
  });

  it('keeps dryRun true on a failed dry run', async () => {
    thrown.err = new Error('graph unreadable');
    const r = await doStripMarkers({ 'dry-run': true }, ROOT);
    expect(r.exitCode).toBe(1);
    expect(r.data).toEqual({ changedIds: [], changedCount: 0, dryRun: true });
  });
});
