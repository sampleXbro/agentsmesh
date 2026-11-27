import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../../../src/cli/command-result.js';
import { handleResult } from '../../../src/cli/json-handler.js';
import { emitJson } from '../../../src/cli/json-output.js';

let writeSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  writeSpy.mockRestore();
  exitSpy.mockRestore();
});

function emitted(): unknown {
  return JSON.parse(writeSpy.mock.calls[0]![0] as string);
}

describe('emitJson error code', () => {
  it('adds code to a failed envelope, between error and data', () => {
    const result: CommandResult = {
      success: false,
      error: 'Unknown topic: nope.',
      code: 'UNKNOWN_TOPIC',
      data: { id: '' },
    };
    emitJson('lessons', result);
    expect(Object.keys(emitted() as object)).toEqual([
      'success',
      'command',
      'error',
      'code',
      'data',
    ]);
    expect(emitted()).toEqual({
      success: false,
      command: 'lessons',
      error: 'Unknown topic: nope.',
      code: 'UNKNOWN_TOPIC',
      data: { id: '' },
    });
  });

  it('leaves code out when the failure has none', () => {
    emitJson('init', { success: false, error: 'Config not found' });
    expect(emitted()).toEqual({ success: false, command: 'init', error: 'Config not found' });
  });
});

describe('handleResult error code', () => {
  const flags = { json: true };

  it('carries the result code into the failed envelope and keeps the exit code', () => {
    handleResult(
      'lessons',
      { exitCode: 2, error: 'No effective trigger.', code: 'NO_TRIGGER', data: { id: '' } },
      flags,
      vi.fn(),
    );
    expect(emitted()).toEqual({
      success: false,
      command: 'lessons',
      error: 'No effective trigger.',
      code: 'NO_TRIGGER',
      data: { id: '' },
    });
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('omits code when the result has none', () => {
    handleResult('lessons', { exitCode: 1, error: 'boom', data: null }, flags, vi.fn());
    expect(emitted()).toEqual({ success: false, command: 'lessons', error: 'boom', data: null });
  });

  it('never adds code to a success envelope', () => {
    handleResult('lessons', { exitCode: 0, code: 'STALE', data: { ok: true } }, flags, vi.fn());
    expect(emitted()).toEqual({ success: true, command: 'lessons', data: { ok: true } });
  });

  it('does not touch plain output: render runs and no JSON is written', () => {
    const render = vi.fn();
    handleResult(
      'lessons',
      { exitCode: 2, error: 'x', code: 'NO_TRIGGER', data: null },
      {},
      render,
    );
    expect(render).toHaveBeenCalledTimes(1);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
