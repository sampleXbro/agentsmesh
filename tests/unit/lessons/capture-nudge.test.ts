import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCaptureNudge, CAPTURE_NUDGE_SENTINEL } from '../../../src/lessons/capture-nudge.js';
import { getCommandMatcher } from '../../../src/lessons/regex-safety.js';

let counter = 0;
const sessions: string[] = [];
function uniqueSession(): string {
  const id = `nudge-${process.pid}-${counter++}`;
  sessions.push(id);
  return id;
}

beforeEach(() => {
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const id of sessions.splice(0)) {
    rmSync(join(tmpdir(), 'agentsmesh-lessons-seen', `${id}.json`), { force: true });
  }
});

describe('buildCaptureNudge', () => {
  it('pre-fills --trigger-file with the failed file path', () => {
    const ctx = buildCaptureNudge({ file: 'src/x.ts' });
    expect(ctx).toContain("--trigger-file 'src/x.ts'");
    expect(ctx).toContain('lessons add');
  });

  it('steers the trigger to the recurrence surface, not just the discovery file', () => {
    const ctx = buildCaptureNudge({ file: 'src/x.ts' });
    expect(ctx).toContain('Trigger where it will RECUR');
    expect(ctx).toContain('file-CLASS');
  });

  it('pre-fills --trigger-cmd with the failed command CLASS, not a placeholder', () => {
    const ctx = buildCaptureNudge({ command: 'git commit -m "wip"' });
    expect(ctx).toContain("--trigger-cmd '\\bgit commit\\b'");
    expect(ctx).not.toContain('<regex matching the command>');
  });

  it('escapes regex metacharacters in the derived command class', () => {
    const ctx = buildCaptureNudge({ command: 'foo.bar baz --flag' });
    expect(ctx).toContain("--trigger-cmd '\\bfoo\\.bar baz\\b'");
  });

  it('wraps the derived class in word boundaries so a short class cannot fire mid-word', () => {
    // An unanchored `rm` would fire on `pnpm run format`.
    const ctx = buildCaptureNudge({ command: 'rm -rf build' });
    expect(ctx).toContain("--trigger-cmd '\\brm\\b'");
  });

  it('keeps the placeholder for a command with no derivable class', () => {
    const ctx = buildCaptureNudge({ command: 'FOO=bar' });
    expect(ctx).toContain("--trigger-cmd '<regex matching the command>'");
  });

  it('never carries a quote fragment into the pasted shell line', () => {
    const ctx = buildCaptureNudge({ command: "grep foo' src" });
    expect(ctx).toContain("--trigger-cmd '\\bgrep\\b'");
    expect(ctx).not.toContain("foo'");
  });

  it('keys a compound command on the real program, not on cd', () => {
    const ctx = buildCaptureNudge({ command: 'cd /repo && pnpm tsc --noEmit' });
    expect(ctx).toContain("--trigger-cmd '\\bpnpm tsc\\b'");
  });

  it.each([
    ['git -C packages/app commit -m x', '\\bgit\\b.*\\bcommit\\b'],
    ['pnpm --filter web test', '\\bpnpm\\b.*\\btest\\b'],
    ['npx -y vitest run', '\\bnpx\\b.*\\bvitest\\b'],
  ])(
    'a subcommand behind global flags gets a pattern that matches the failed command (%s)',
    (command, pattern) => {
      const ctx = buildCaptureNudge({ command });
      expect(ctx).toContain(`--trigger-cmd '${pattern}'`);
      const matcher = getCommandMatcher(pattern);
      expect(matcher?.test(command, { remaining: 100_000 })).toBe(true);
    },
  );

  it('suggests a project-relative file trigger for an absolute path inside the project', () => {
    const ctx = buildCaptureNudge({ file: '/proj/src/lessons/hook.ts', projectRoot: '/proj' });
    expect(ctx).toContain("--trigger-file 'src/lessons/hook.ts'");
    expect(ctx).not.toContain('/proj/');
  });

  it('never suggests an absolute or outside-project path as a file trigger', () => {
    const outside = buildCaptureNudge({ file: '/elsewhere/x.ts', projectRoot: '/proj' });
    expect(outside).toContain("--trigger-file '<glob>'");
    expect(outside).not.toContain('elsewhere');
    const noRoot = buildCaptureNudge({ file: '/abs/x.ts' });
    expect(noRoot).toContain("--trigger-file '<glob>'");
  });

  it('states the rule shape that makes lessons worth reading', () => {
    for (const input of [{ file: 'src/x.ts' }, { command: 'pnpm test' }]) {
      const ctx = buildCaptureNudge(input);
      expect(ctx).toContain('cite the symptom');
      expect(ctx).toContain('why the obvious fix is wrong');
    }
  });

  it('falls back to a generic --trigger-file hint when neither file nor command is present', () => {
    const ctx = buildCaptureNudge({});
    expect(ctx).toContain("--trigger-file '<glob>'");
  });

  it('fires at most once per session', () => {
    const sessionId = uniqueSession();
    expect(buildCaptureNudge({ command: 'x', sessionId })).not.toBeNull();
    expect(buildCaptureNudge({ command: 'x', sessionId })).toBeNull();
  });

  it('is not deduped when no session correlator is present (fires each time)', () => {
    expect(buildCaptureNudge({ command: 'x' })).not.toBeNull();
    expect(buildCaptureNudge({ command: 'x' })).not.toBeNull();
  });

  it('exposes a sentinel that cannot collide with a real kebab-case lesson id', () => {
    expect(CAPTURE_NUDGE_SENTINEL).toMatch(/^__.*__$/);
  });
});

describe('buildCaptureNudge — recurrence escalation (STORE)', () => {
  it('escalates when the action recurred and no lesson covers it, surfacing the error class', () => {
    const ctx = buildCaptureNudge({
      command: 'npm run build',
      failures: 2,
      covered: false,
      lastErrorClass: 'typeerror: boom',
    });
    expect(ctx).toContain('has failed 2×');
    expect(ctx).toContain('no lesson covers it');
    expect(ctx).toContain('typeerror: boom');
    expect(ctx).toContain('--trigger-cmd');
  });

  it('does NOT escalate when a lesson already covers the recurring failure', () => {
    expect(buildCaptureNudge({ command: 'x', failures: 5, covered: true })).not.toContain(
      'has failed',
    );
  });

  it('does NOT escalate on the first failure of an action', () => {
    expect(buildCaptureNudge({ command: 'x', failures: 1, covered: false })).not.toContain(
      'has failed',
    );
  });

  it('omits the error-class note when lastErrorClass is undefined', () => {
    const ctx = buildCaptureNudge({ command: 'npm run build', failures: 2, covered: false });
    expect(ctx).toContain('has failed 2×');
    expect(ctx).not.toContain('The recurring error');
  });

  it('the two tiers dedup independently — generic then recurrence each fire once', () => {
    const sessionId = uniqueSession();
    expect(buildCaptureNudge({ command: 'x', sessionId, failures: 1, covered: false })).toContain(
      'just failed',
    );
    expect(buildCaptureNudge({ command: 'x', sessionId, failures: 1, covered: false })).toBeNull(); // generic deduped
    expect(buildCaptureNudge({ command: 'x', sessionId, failures: 2, covered: false })).toContain(
      'has failed 2×',
    );
    expect(buildCaptureNudge({ command: 'x', sessionId, failures: 3, covered: false })).toBeNull(); // recurrence deduped
  });
});
