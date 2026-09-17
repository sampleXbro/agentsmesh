/**
 * Windows filesystem safety helpers.
 *
 * Generated artifact paths must survive a Windows clone/checkout/write cycle.
 * Windows rejects paths containing reserved device names (CON, PRN, AUX, NUL,
 * COM1-9, LPT1-9), reserved characters (`<>:"|?*` plus ASCII control chars), or
 * trailing dots/spaces in any path segment, and case-insensitive collisions
 * silently overwrite each other on default NTFS / APFS volumes.
 */

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

// Reserved characters per Microsoft's Windows naming conventions (`<>:"|?*`)
// plus ASCII control characters 0x00-0x1F. Path separators `/` and `\` are
// excluded because callers split paths into segments first.
// eslint-disable-next-line no-control-regex
const WINDOWS_ILLEGAL_CHARS = new RegExp('[<>:"|?*\\u0000-\\u001F]');

export type WindowsPathIssueReason =
  | 'reserved-name'
  | 'illegal-character'
  | 'trailing-dot-or-space';

export interface WindowsPathIssue {
  segment: string;
  reason: WindowsPathIssueReason;
}

function segmentReservedName(segment: string): boolean {
  const stem = segment.replace(/\.[^.]*$/, '').toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(stem);
}

export function findWindowsPathIssues(path: string): WindowsPathIssue[] {
  const issues: WindowsPathIssue[] = [];
  const segments = path.split(/[\\/]/);
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') continue;
    if (WINDOWS_ILLEGAL_CHARS.test(segment)) {
      issues.push({ segment, reason: 'illegal-character' });
      continue;
    }
    if (/[. ]$/.test(segment)) {
      issues.push({ segment, reason: 'trailing-dot-or-space' });
      continue;
    }
    if (segmentReservedName(segment)) {
      issues.push({ segment, reason: 'reserved-name' });
    }
  }
  return issues;
}
