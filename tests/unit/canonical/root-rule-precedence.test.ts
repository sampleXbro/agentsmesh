/**
 * Exactly one root rule survives the extends → packs → local merge: the
 * project's own, else a pack's, else an extend's. Any other `root: true` rule is
 * used as a normal rule, so an installed pack (even an untrusted remote one) or
 * an extend can never replace the project's root instructions (GHSA-4m36-whwv-q74c).
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCanonicalWithExtends } from '../../../src/canonical/extends/extends.js';
import { runGenerate } from '../../../src/cli/commands/generate.js';
import { loadConfigFromDir } from '../../../src/config/core/loader.js';
import { logger } from '../../../src/utils/output/logger.js';

let base: string;
let project: string;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const rootRule = (title: string): string => `---\nroot: true\ndescription: r\n---\n# ${title}\n`;

function setup({ extend }: { extend: boolean }): void {
  const ext = extend
    ? '\nextends:\n  - name: base\n    source: ../shared\n    features: [rules]\n'
    : '\n';
  write(
    join(project, 'agentsmesh.yaml'),
    `version: 1\ntargets: [claude-code, cursor]\nfeatures: [rules]${ext}`,
  );
  const pack = join(project, '.agentsmesh', 'packs', 'sneak');
  write(join(pack, 'rules', 'sneaky.md'), rootRule('SNEAKY PACK ROOT'));
  write(
    join(pack, 'pack.yaml'),
    'name: sneak\nsource: github:org/repo@abc123\nsource_kind: github\n' +
      'installed_at: "2026-09-24T00:00:00Z"\nupdated_at: "2026-09-24T00:00:00Z"\n' +
      'content_hash: sha256:aabbcc\nfeatures:\n  - rules\n',
  );
  write(join(base, 'shared', '.agentsmesh', 'rules', 'base-root.md'), rootRule('EXTEND ROOT'));
}

async function roots(): Promise<string[]> {
  const { config } = await loadConfigFromDir(project);
  const { canonical } = await loadCanonicalWithExtends(config, project);
  return canonical.rules.filter((r) => r.root).map((r) => r.body.trim());
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-root-prec-')));
  project = join(base, 'project');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('root rule precedence', () => {
  it("keeps the project's own root over a pack's and an extend's", async () => {
    setup({ extend: true });
    write(join(project, '.agentsmesh', 'rules', '_root.md'), rootRule('USER ROOT'));

    expect(await roots()).toEqual(['# USER ROOT']);
  });

  it("uses a pack's root over an extend's when the project has none", async () => {
    setup({ extend: true });

    expect(await roots()).toEqual(['# SNEAKY PACK ROOT']);
  });

  it('keeps the other root rules as normal rules and says so', async () => {
    setup({ extend: false });
    write(join(project, '.agentsmesh', 'rules', '_root.md'), rootRule('USER ROOT'));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const { config } = await loadConfigFromDir(project);
    const { canonical } = await loadCanonicalWithExtends(config, project);

    const sneaky = canonical.rules.find((r) => r.body.includes('SNEAKY PACK ROOT'));
    expect(sneaky?.root).toBe(false);
    expect(warn.mock.calls.map(([m]) => String(m))).toEqual([
      '[agentsmesh] Rule ".agentsmesh/packs/sneak/rules/sneaky.md" also says root: true, but ' +
        '".agentsmesh/rules/_root.md" is the root rule (the project\'s own root wins over installed ' +
        'packs, and packs over extends), so it is used as a normal rule.',
    ]);
  });

  it('generate writes the user root, not the pack root, as the root output', async () => {
    setup({ extend: false });
    write(join(project, '.agentsmesh', 'rules', '_root.md'), rootRule('USER ROOT'));

    await runGenerate({}, project, { printMatrix: false });

    const claude = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
    const cursor = readFileSync(join(project, '.cursor', 'rules', 'general.mdc'), 'utf8');
    expect([claude.includes('USER ROOT'), claude.includes('SNEAKY PACK ROOT')]).toEqual([
      true,
      false,
    ]);
    expect([cursor.includes('USER ROOT'), cursor.includes('SNEAKY PACK ROOT')]).toEqual([
      true,
      false,
    ]);
  });
});
