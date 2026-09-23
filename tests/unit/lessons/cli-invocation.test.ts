/**
 * How a generated hook or git merge driver should launch the CLI.
 *
 * A bare `agentsmesh` only resolves for someone with a global install. A
 * teammate who has it only as a project dependency gets a failed hook, and the
 * host hides that failure from the model. A stale global install also beats the
 * version the project pins.
 *
 * `npx --no --offline agentsmesh` fixes both, because npx prefers the
 * project's own copy, falls back to a global one, and never downloads. But it
 * roughly doubles the per-call cost for a global-only user (measured ~180 ms
 * vs ~380 ms), and the hook runs before every edit and command. So npx is used
 * only when the project actually depends on agentsmesh, which is exactly when it
 * pays off; everyone else keeps the fast bare command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentsmeshInvocation } from '../../../src/lessons/cli-invocation.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-invoke-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function pkg(content: unknown): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify(content));
}

describe('agentsmeshInvocation', () => {
  it('uses npx when agentsmesh is a devDependency, so the project copy wins', () => {
    pkg({ devDependencies: { agentsmesh: '^0.41.0' } });
    expect(agentsmeshInvocation(root)).toBe('npx --no --offline agentsmesh');
  });

  it('uses npx for a runtime or optional dependency too', () => {
    pkg({ dependencies: { agentsmesh: '0.41.0' } });
    expect(agentsmeshInvocation(root)).toBe('npx --no --offline agentsmesh');
    pkg({ optionalDependencies: { agentsmesh: '*' } });
    expect(agentsmeshInvocation(root)).toBe('npx --no --offline agentsmesh');
  });

  it('keeps the fast bare command when the project does not depend on agentsmesh', () => {
    pkg({ devDependencies: { vitest: '^4.0.0' } });
    expect(agentsmeshInvocation(root)).toBe('agentsmesh');
  });

  it('keeps the bare command when there is no package.json at all', () => {
    expect(agentsmeshInvocation(root)).toBe('agentsmesh');
  });

  it('keeps the bare command when package.json is unreadable, rather than failing', () => {
    writeFileSync(join(root, 'package.json'), '{ not json');
    expect(agentsmeshInvocation(root)).toBe('agentsmesh');
  });

  it('ignores a package that merely has agentsmesh in its name', () => {
    pkg({ devDependencies: { 'agentsmesh-plugin-foo': '1.0.0' } });
    expect(agentsmeshInvocation(root)).toBe('agentsmesh');
  });
});
