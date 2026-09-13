/**
 * Several targets share one `AGENTS.md`. When their bodies differ only inside
 * the embedded-rules block — which is what `targets:`-scoped rules produce —
 * the resolver used to keep whichever body was byte-longer and drop the other
 * target's rule silently.
 */

import { describe, expect, it, vi } from 'vitest';
import { resolveOutputCollisions } from '../../../../src/core/generate/collision.js';
import type { GenerateResult } from '../../../../src/core/types.js';

vi.mock('../../../../src/utils/output/logger.js', () => ({
  logger: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const RULE_A =
  '<!-- agentsmesh:embedded-rule:start {"source":"a.md","targets":["codex-cli"]} -->\nOnly codex.\n<!-- agentsmesh:embedded-rule:end -->';
const RULE_B =
  '<!-- agentsmesh:embedded-rule:start {"source":"b.md","targets":["amp"]} -->\nOnly amp.\n<!-- agentsmesh:embedded-rule:end -->';

function agents(target: string, units: string[]): GenerateResult {
  const block = `<!-- agentsmesh:embedded-rules:start -->\n\n${units.join('\n\n')}\n\n<!-- agentsmesh:embedded-rules:end -->`;
  return {
    target,
    path: 'AGENTS.md',
    content: `# Root\n\nShared root body.\n\n${block}\n`,
    status: 'created',
  };
}

describe('AGENTS.md shared by several targets', () => {
  it('keeps both targets embedded rules instead of dropping the shorter body', () => {
    const out = resolveOutputCollisions([agents('amp', [RULE_B]), agents('codex-cli', [RULE_A])]);

    expect(out).toHaveLength(1);
    expect(out[0]?.content).toContain('Only amp.');
    expect(out[0]?.content).toContain('Only codex.');
  });

  it('does not duplicate a rule both targets already embed', () => {
    const out = resolveOutputCollisions([
      agents('amp', [RULE_A, RULE_B]),
      agents('codex-cli', [RULE_A]),
    ]);

    expect(out).toHaveLength(1);
    const content = out[0]?.content ?? '';
    expect(content.split('Only codex.').length - 1).toBe(1);
    expect(content).toContain('Only amp.');
  });

  it('recomputes status so a merged body is not reported as unchanged', () => {
    const left = { ...agents('amp', [RULE_B]), status: 'unchanged' as const };
    const out = resolveOutputCollisions([
      { ...left, currentContent: left.content },
      agents('codex-cli', [RULE_A]),
    ]);

    expect(out[0]?.status).toBe('updated');
  });

  it('still throws when the bodies differ outside the embedded block', () => {
    expect(() =>
      resolveOutputCollisions([
        { ...agents('amp', [RULE_A]), content: '# Root\n\nAmp body.\n' },
        { ...agents('codex-cli', [RULE_A]), content: '# Root\n\nCodex body.\n' },
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });

  it('prefers codex only when its body covers every line of the other', () => {
    const shared: GenerateResult = {
      target: 'cursor',
      path: 'AGENTS.md',
      content: 'line one\n',
      status: 'created',
    };
    const superset: GenerateResult = {
      target: 'codex-cli',
      path: 'AGENTS.md',
      content: 'line one\nline two\n',
      status: 'created',
    };

    expect(resolveOutputCollisions([shared, superset])[0]?.target).toBe('codex-cli');
  });

  it('refuses to pick the longer body when each side has lines the other lacks', () => {
    expect(() =>
      resolveOutputCollisions([
        { target: 'cursor', path: 'AGENTS.md', content: 'cursor data\n', status: 'created' },
        {
          target: 'codex-cli',
          path: 'AGENTS.md',
          content: 'codex one\ncodex two\n',
          status: 'created',
        },
      ]),
    ).toThrow(/Conflicting generated outputs/);
  });
});
