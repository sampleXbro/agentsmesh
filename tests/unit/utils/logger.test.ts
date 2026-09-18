import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, muteLogger, unmuteLogger } from '../../../src/utils/output/logger.js';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info writes to stdout', () => {
    logger.info('hello');
    expect(process.stdout.write).toHaveBeenCalled();
  });

  it('error writes to stderr', () => {
    logger.error('fail');
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('success prefixes with checkmark', () => {
    logger.success('done');
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('✓');
    expect(output).toContain('done');
  });

  it('warn prefixes with warning symbol', () => {
    logger.warn('careful');
    const output = vi.mocked(process.stderr.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('⚠');
  });

  it('warn emits no ANSI escapes when stderr is not a TTY', () => {
    // Gate the stderr-routed color decision: clear both overrides so only the
    // non-TTY stderr that vitest captures can suppress color.
    const prevNoColor = process.env.NO_COLOR;
    const prevForce = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    logger.warn('careful');
    const output = vi.mocked(process.stderr.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('⚠');
    // eslint-disable-next-line no-control-regex -- testing ANSI escape codes
    expect(output).not.toMatch(/\x1b\[/);
    if (prevNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prevNoColor;
    if (prevForce === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prevForce;
  });

  it('respects NO_COLOR env', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    logger.info('plain');
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    // eslint-disable-next-line no-control-regex -- testing ANSI escape codes
    expect(output).not.toMatch(/\x1b\[/);
    process.env.NO_COLOR = prev;
  });

  it('info emits no ANSI escapes when stdout is not a TTY', () => {
    // Isolate the isTTY path: clear both overrides so the only reason color
    // could be suppressed is the non-TTY stdout that vitest captures.
    const prevNoColor = process.env.NO_COLOR;
    const prevForce = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    logger.info('piped');
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('piped');
    // eslint-disable-next-line no-control-regex -- testing ANSI escape codes
    expect(output).not.toMatch(/\x1b\[/);
    if (prevNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prevNoColor;
    if (prevForce === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prevForce;
  });

  it('info emits ANSI color on a non-TTY when FORCE_COLOR is set', () => {
    const prev = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = '1';
    logger.info('forced');
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    // eslint-disable-next-line no-control-regex -- testing ANSI escape codes
    expect(output).toMatch(/\x1b\[/);
    if (prev === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prev;
  });

  it('info emits ANSI color when stdout is a TTY', () => {
    const prevNoColor = process.env.NO_COLOR;
    const prevForce = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    const orig = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    logger.info('tty');
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    // eslint-disable-next-line no-control-regex -- testing ANSI escape codes
    expect(output).toMatch(/\x1b\[/);
    if (orig) Object.defineProperty(process.stdout, 'isTTY', orig);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    if (prevNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prevNoColor;
    if (prevForce === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prevForce;
  });

  it('debug writes when AGENTSMESH_DEBUG=1', () => {
    const prev = process.env.AGENTSMESH_DEBUG;
    process.env.AGENTSMESH_DEBUG = '1';
    logger.debug('trace');
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('[debug]'));
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('trace'));
    process.env.AGENTSMESH_DEBUG = prev;
  });

  it('debug does nothing when AGENTSMESH_DEBUG not set', () => {
    const prev = process.env.AGENTSMESH_DEBUG;
    delete process.env.AGENTSMESH_DEBUG;
    vi.mocked(process.stdout.write).mockClear();
    logger.debug('silent');
    expect(process.stdout.write).not.toHaveBeenCalled();
    if (prev !== undefined) process.env.AGENTSMESH_DEBUG = prev;
  });

  it('muteLogger suppresses all output', () => {
    muteLogger();
    logger.info('muted-info');
    logger.warn('muted-warn');
    logger.error('muted-error');
    logger.success('muted-success');
    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
    unmuteLogger();
  });

  it('unmuteLogger restores output', () => {
    muteLogger();
    unmuteLogger();
    logger.info('restored');
    expect(process.stdout.write).toHaveBeenCalled();
  });
});
