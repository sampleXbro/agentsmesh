import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { safeWrite } from '../../../../src/mcp/writers/safe-write.js';
import { safeConfigWrite } from '../../../../src/mcp/writers/safe-config-write.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'am-mcp-atomic-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it.each(['canonical', 'config'] as const)(
  'isolates simultaneous %s writes in the same millisecond',
  async (kind) => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const payloads = Array.from({ length: 8 }, (_, index) => String(index).repeat(10000));
    const target = join(
      root,
      kind === 'canonical' ? '.agentsmesh/rules/demo.md' : 'agentsmesh.yaml',
    );
    const results = await Promise.allSettled(
      payloads.map((content) =>
        kind === 'canonical'
          ? safeWrite({ projectRoot: root, feature: 'rules', relativePath: 'demo.md', content })
          : safeConfigWrite({ projectRoot: root, content }),
      ),
    );
    expect(results).toEqual(payloads.map(() => ({ status: 'fulfilled', value: target })));
    expect(payloads).toContain(await readFile(target, 'utf8'));
    expect(await readdir(dirname(target))).toEqual([
      kind === 'canonical' ? 'demo.md' : 'agentsmesh.yaml',
    ]);
  },
);
