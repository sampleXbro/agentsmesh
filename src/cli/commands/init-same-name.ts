/**
 * Same-name rules, commands and agents across the tools `init --yes` imports.
 *
 * A canonical name comes from the file name, so two tools' `typescript.md`
 * rules land on one file, and the later importer also mixes the earlier file's
 * frontmatter into its own (#132). Inside one init run we know which tool wrote
 * which file, so each later tool imports with the earlier tools' files set
 * aside. Afterwards the earlier file is put back; if the later tool wrote a
 * different text there, that text is kept too, as `<name>-<tool>.md`.
 * `agentsmesh import --from` stays last-import-wins.
 */

import { rm } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { exists, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { splitFrontmatter } from '../../utils/text/markdown.js';

export interface SameNameCopy {
  /** The earlier tool's file, kept as it was. */
  readonly path: string;
  /** Where the later tool's different text was saved. */
  readonly copy: string;
  /** The later tool. */
  readonly tool: string;
}

/** Rule, command and agent files; `_root.md` and other `_` files are not entities. */
const ENTITY_FILE = /^\.agentsmesh\/(?:rules|commands|agents)\/(?:.+\/)?[^/_][^/]*\.md$/;

const toPosix = (path: string): string => path.replaceAll('\\', '/');

function bodyOf(content: string): string {
  const body = splitFrontmatter(content)?.body ?? content;
  return body.replace(/\r\n?/g, '\n').trim();
}

async function freeName(rootBase: string, rel: string, tool: string): Promise<string> {
  const stem = posix.join(posix.dirname(rel), `${posix.basename(rel, '.md')}-${tool}`);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${stem}.md` : `${stem}-${n}.md`;
    if (!(await exists(join(rootBase, candidate)))) return candidate;
  }
}

/**
 * Run one tool's import so it cannot replace or mix with the entity files in
 * `owned` (written by earlier tools in this run). Adds the files this import
 * wrote to `owned`, and returns its results with renamed copies applied.
 */
export async function importKeepingSameName(
  rootBase: string,
  tool: string,
  owned: Set<string>,
  run: () => Promise<ImportResult[]>,
): Promise<{ results: ImportResult[]; copies: SameNameCopy[] }> {
  const earlier = new Map<string, string>();
  for (const rel of owned) {
    const content = await readFileSafe(join(rootBase, rel));
    if (content === null) continue;
    earlier.set(rel, content);
    await rm(join(rootBase, rel), { force: true });
  }

  let results: ImportResult[];
  try {
    results = await run();
  } catch (err) {
    for (const [rel, content] of earlier) await writeFileAtomic(join(rootBase, rel), content);
    throw err;
  }

  const copies: SameNameCopy[] = [];
  for (const [rel, content] of earlier) {
    const now = await readFileSafe(join(rootBase, rel));
    if (now !== null && bodyOf(now) !== bodyOf(content)) {
      const copy = await freeName(rootBase, rel, tool);
      await writeFileAtomic(join(rootBase, copy), now);
      copies.push({ path: rel, copy, tool });
    }
    await writeFileAtomic(join(rootBase, rel), content);
  }

  const renamed = new Map(copies.map((c) => [c.path, c.copy]));
  const moved = results.map((r) => {
    const copy = renamed.get(toPosix(r.toPath));
    return copy === undefined ? r : { ...r, toPath: copy };
  });
  for (const r of moved) {
    if (ENTITY_FILE.test(toPosix(r.toPath))) owned.add(toPosix(r.toPath));
  }
  return { results: moved, copies };
}
