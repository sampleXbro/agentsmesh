/**
 * `init --lessons` always says what happened to the recall hook. A run that
 * changed nothing must not look like a run that could not wire it.
 */

import { describe, expect, it } from 'vitest';
import { renderInit } from '../../../../src/cli/renderers/init.js';
import { lessonsInit, useCapturedOutput } from './renderer-test-helpers.js';

const WIRED_LINE =
  'Wired the lessons recall hook into .agentsmesh/hooks.yaml (deterministic recall on targets whose hooks can inject context)';

describe('renderInit — recall hook outcome', () => {
  const output = useCapturedOutput();

  it('says it created hooks.yaml and wired the hook into it', () => {
    renderInit(lessonsInit({ recallHook: { status: 'created' }, recallHookInjected: true }));
    expect(output.stdout()).toContain(
      '  Created .agentsmesh/hooks.yaml and wired the lessons recall hook into it ' +
        '(deterministic recall on targets whose hooks can inject context)\n',
    );
    expect(output.stdout()).not.toContain(WIRED_LINE);
    expect(output.stderr()).toBe('');
  });

  it('says it wired the hook into an existing hooks.yaml', () => {
    renderInit(lessonsInit({ recallHook: { status: 'wired' }, recallHookInjected: true }));
    expect(output.stdout()).toContain(`  ${WIRED_LINE}\n`);
  });

  it('says the hook is already current instead of printing nothing', () => {
    renderInit(lessonsInit({ recallHook: { status: 'current' }, recallHookInjected: false }));
    expect(output.stdout()).toContain(
      '  Lessons recall hook in .agentsmesh/hooks.yaml is already current\n',
    );
    expect(output.stdout()).not.toContain(WIRED_LINE);
    expect(output.stderr()).toBe('');
  });

  it('warns with the reason when the hook was skipped', () => {
    renderInit(
      lessonsInit({
        recallHook: { status: 'skipped', reason: '.agentsmesh/hooks.yaml is not valid YAML' },
        recallHookInjected: false,
      }),
    );
    expect(output.stderr()).toContain(
      "⚠   Skipped the lessons recall hook: .agentsmesh/hooks.yaml is not valid YAML. Fix this, then re-run 'agentsmesh init --lessons'.\n",
    );
    expect(output.stdout()).not.toContain(WIRED_LINE);
    expect(output.stdout()).not.toContain('already current');
  });

  it('never prints the success summary line for a skipped hook as wired', () => {
    renderInit(
      lessonsInit({
        recallHook: {
          status: 'skipped',
          reason: 'there is no .agentsmesh/hooks.yaml to wire it into',
        },
        recallHookInjected: false,
      }),
    );
    expect(output.stdout()).toContain('Lessons subsystem ready (.agentsmesh/lessons/).');
    expect(output.stderr()).toContain(
      'Skipped the lessons recall hook: there is no .agentsmesh/hooks.yaml',
    );
  });
});

describe('renderInit — hooks feature warning', () => {
  const output = useCapturedOutput();
  const WARNING =
    "The lessons recall hook will not reach any tool: `hooks` is not in `features` in agentsmesh.yaml. Add `hooks` to `features` in agentsmesh.yaml, then run 'agentsmesh generate'.";

  it('prints the warning once, on stderr, with the fix', () => {
    renderInit(lessonsInit({ hooksFeatureWarning: WARNING }));
    expect(output.stderr()).toBe(`⚠   ${WARNING}\n`);
  });

  it('prints nothing when there is no warning', () => {
    renderInit(lessonsInit({ hooksFeatureWarning: null }));
    expect(output.stderr()).toBe('');
  });
});
