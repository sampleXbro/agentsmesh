import { describe, expect, it } from 'vitest';
import {
  linuxStartIdentity,
  processIdentity,
  selfIdentity,
} from '../../../../src/utils/filesystem/process-identity.js';

const STAT_TAIL = 'S 1 4242 4242 0 -1 4194560 120 0 0 0 7 3 0 0 20 0 1 0 987654 1234567 89';

describe('linuxStartIdentity', () => {
  it('joins the boot id with the start-time field (22) of /proc/<pid>/stat', () => {
    expect(linuxStartIdentity(`4242 (node) ${STAT_TAIL}`, 'boot-abc\n')).toBe('boot-abc:987654');
  });

  it('counts fields from the last ")" so a command name with spaces and parens parses', () => {
    const stat = `4242 (my (odd) proc name) ${STAT_TAIL}`;
    expect(linuxStartIdentity(stat, 'boot-abc')).toBe('boot-abc:987654');
  });

  it('returns null for a truncated or non-numeric stat line', () => {
    expect(linuxStartIdentity('4242 (node) S 1 2 3', 'boot-abc')).toBeNull();
    expect(linuxStartIdentity(`4242 (node) ${STAT_TAIL.replace('987654', 'x')}`, 'b')).toBeNull();
  });

  it('returns null without a boot id', () => {
    expect(linuxStartIdentity(`4242 (node) ${STAT_TAIL}`, '  \n')).toBeNull();
  });
});

describe('processIdentity', () => {
  it('returns null for pids that can never be a live process', async () => {
    expect(await processIdentity(0)).toBeNull();
    expect(await processIdentity(-5)).toBeNull();
    expect(await processIdentity(1.5)).toBeNull();
  });

  it('returns null for a pid with no running process', async () => {
    expect(await processIdentity(0x7ffffffe)).toBeNull();
  });

  it('returns null on Windows, which has no cheap start-time probe', async () => {
    expect(await processIdentity(process.pid, 'win32')).toBeNull();
  });

  it.skipIf(process.platform === 'win32')(
    'gives the running process a stable, non-empty identity',
    async () => {
      const first = await processIdentity(process.pid);
      expect(first).toMatch(/\S/);
      expect(await processIdentity(process.pid)).toBe(first);
      expect(await selfIdentity()).toBe(first);
    },
  );
});
