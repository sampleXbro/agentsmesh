/** Claude Code lacks a .claudeignore loader: only Read denies restrict file access. */
import { dirname, join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { CLAUDE_SETTINGS } from './constants.js';

export function claudeIgnoreDenyRules(patterns: readonly string[]): string[] {
  const result = new Set<string>();
  for (const value of patterns) {
    const raw = value.trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('!')) continue;
    const path = raw.replace(/^\.\//, '').replace(/^\//, '');
    if (!path || path.includes(')')) continue;
    result.add(`Read(./${path.endsWith('/') ? `${path}**` : path})`);
  }
  return [...result];
}

export function claudeIgnorePatternsFromDenies(deny: readonly string[]): string[] {
  const patterns = new Set<string>();
  for (const rule of deny) {
    const match = /^Read\(\.\/(.+)\)$/.exec(rule);
    if (!match) continue;
    let path = match[1]!;
    if (path.endsWith('/**')) path = path.slice(0, -2);
    patterns.add(path);
  }
  return [...patterns];
}

export async function importClaudeDenyIgnore(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  // A legacy file takes precedence, avoiding two sources overwriting one another.
  if (results.some((result) => result.feature === 'ignore')) return;
  const path = join(projectRoot, CLAUDE_SETTINGS);
  const content = await readFileSafe(path);
  if (content === null) return;
  let json: { permissions?: { deny?: unknown } };
  try { json = JSON.parse(content) as typeof json; } catch { return; }
  const raw = json?.permissions?.deny;
  if (!Array.isArray(raw)) return;
  const patterns = claudeIgnorePatternsFromDenies(raw.filter((value): value is string =>
    typeof value === 'string'));
  if (patterns.length === 0) return;
  const toPath = '.agentsmesh/ignore';
  await mkdirp(dirname(join(projectRoot, toPath)));
  await writeFileAtomic(join(projectRoot, toPath), patterns.join('\n') + '\n');
  results.push({ fromTool: 'claude-code', fromPath: path, toPath, feature: 'ignore' });
}
