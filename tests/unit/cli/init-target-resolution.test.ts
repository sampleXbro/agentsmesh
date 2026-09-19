/**
 * Which targets `agentsmesh init` enables, and why.
 *
 * Regression guard: a non-interactive init in a repo with no tool config used
 * to enable every builtin target, so the next `generate` scattered dozens of
 * files and directories across the project root. Evidence of intent now wins
 * over breadth — what the repo uses, else what the machine has installed, else
 * a small explicit set the user can widen.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveInitTargets,
  type InitTargetInputs,
} from '../../../src/cli/commands/init-target-resolution.js';
import { minimalInitTargetIds } from '../../../src/targets/catalog/init-starter-targets.js';

const MINIMAL = [...minimalInitTargetIds()];

function inputs(overrides: Partial<InitTargetInputs> = {}): InitTargetInputs {
  return { projectDetected: [], machineDetected: [], ...overrides };
}

describe('resolveInitTargets', () => {
  it('prefers tool configs already in the project', () => {
    const resolved = resolveInitTargets(
      inputs({ projectDetected: ['claude-code', 'cursor'], machineDetected: ['zed'] }),
    );
    expect(resolved.targets).toEqual(['claude-code', 'cursor']);
    expect(resolved.source).toBe('project');
  });

  it('falls back to tools installed on the machine when the project has none', () => {
    const resolved = resolveInitTargets(inputs({ machineDetected: ['zed', 'gemini-cli'] }));
    expect(resolved.targets).toEqual(['gemini-cli', 'zed']);
    expect(resolved.source).toBe('machine');
  });

  it('falls back to the minimal set when nothing is detected anywhere', () => {
    const resolved = resolveInitTargets(inputs());
    expect(resolved.targets).toEqual(MINIMAL);
    expect(resolved.source).toBe('fallback');
  });

  it('keeps the minimal set genuinely small', () => {
    expect(MINIMAL.length).toBeGreaterThan(0);
    expect(MINIMAL.length).toBeLessThanOrEqual(4);
  });

  it('honours --targets over every form of detection', () => {
    const resolved = resolveInitTargets(
      inputs({
        explicit: ['zed'],
        projectDetected: ['claude-code'],
        machineDetected: ['cursor'],
      }),
    );
    expect(resolved.targets).toEqual(['zed']);
    expect(resolved.source).toBe('explicit');
  });

  it('honours --all-targets over detection', () => {
    const resolved = resolveInitTargets(
      inputs({ allTargets: true, projectDetected: ['claude-code'] }),
    );
    expect(resolved.source).toBe('all');
    expect(resolved.targets.length).toBeGreaterThan(MINIMAL.length);
    expect(resolved.targets).toContain('claude-code');
  });

  it('rejects an unknown id in --targets and names it', () => {
    expect(() => resolveInitTargets(inputs({ explicit: ['not-a-tool'] }))).toThrow(/not-a-tool/);
  });

  it('rejects --targets that resolves to nothing', () => {
    expect(() => resolveInitTargets(inputs({ explicit: [] }))).toThrow(/at least one/i);
  });

  it('de-duplicates and sorts explicit ids', () => {
    const resolved = resolveInitTargets(inputs({ explicit: ['cursor', 'claude-code', 'cursor'] }));
    expect(resolved.targets).toEqual(['claude-code', 'cursor']);
  });

  it('drops machine-detected targets excluded from bulk scaffolding', () => {
    // codex-cli opts out via `excludeFromStarterInit` because its AGENTS.md
    // index collides with other AGENTS.md-first targets when bulk-enabled.
    const resolved = resolveInitTargets(
      inputs({ machineDetected: ['codex-cli', 'cursor'] }),
    );
    expect(resolved.targets).toEqual(['cursor']);
  });

  it('keeps an excluded target when the project itself uses it', () => {
    const resolved = resolveInitTargets(inputs({ projectDetected: ['codex-cli'] }));
    expect(resolved.targets).toEqual(['codex-cli']);
  });

  it('keeps an excluded target when asked for explicitly', () => {
    const resolved = resolveInitTargets(inputs({ explicit: ['codex-cli'] }));
    expect(resolved.targets).toEqual(['codex-cli']);
  });

  it('falls back to the minimal set when machine detection only found excluded targets', () => {
    const resolved = resolveInitTargets(inputs({ machineDetected: ['codex-cli'] }));
    expect(resolved.targets).toEqual(MINIMAL);
    expect(resolved.source).toBe('fallback');
  });

  it('restricts every outcome to the allowed set when one is given (global scope)', () => {
    const allowed = ['claude-code', 'cursor'];
    expect(
      resolveInitTargets(inputs({ machineDetected: ['zed', 'cursor'], allowed })).targets,
    ).toEqual(['cursor']);
    expect(resolveInitTargets(inputs({ allowed })).targets).toEqual(
      MINIMAL.filter((id) => allowed.includes(id)),
    );
  });

  it('rejects an explicit id that is valid but outside the allowed set', () => {
    expect(() =>
      resolveInitTargets(inputs({ explicit: ['zed'], allowed: ['claude-code'] })),
    ).toThrow(/zed/);
  });
});
