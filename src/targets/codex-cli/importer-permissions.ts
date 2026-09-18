/**
 * Imports `.codex/rules/agentsmesh-permissions.rules` back into
 * `.agentsmesh/permissions.yaml`. The generator embeds one
 * `# agentsmesh-permission <decision>: <pattern>` marker comment per canonical
 * entry (see generator/permissions.ts) — that marker, not the `prefix_rule`
 * body, is authoritative for round-trip so the original canonical pattern
 * string always survives regardless of how it was tokenized.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import { readFileSafe, mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { CODEX_TARGET, CODEX_RULES_DIR, CODEX_PERMISSIONS_RULES_BASENAME } from './constants.js';

const MARKER_PATTERN = /^#\s*agentsmesh-permission\s+(allow|ask|deny):\s*(.+)$/;

export async function importCodexPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, CODEX_RULES_DIR, CODEX_PERMISSIONS_RULES_BASENAME);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const allow: string[] = [];
  const ask: string[] = [];
  const deny: string[] = [];
  for (const line of content.split('\n')) {
    const match = MARKER_PATTERN.exec(line.trim());
    if (!match) continue;
    const [, decision, pattern] = match as unknown as [string, 'allow' | 'ask' | 'deny', string];
    if (decision === 'allow') allow.push(pattern);
    else if (decision === 'ask') ask.push(pattern);
    else deny.push(pattern);
  }
  if (allow.length + ask.length + deny.length === 0) return;

  const canonical: { allow: string[]; deny: string[]; ask?: string[] } = { allow, deny };
  if (ask.length > 0) canonical.ask = ask;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  await mkdirp(join(projectRoot, '.agentsmesh'));
  await writeFileAtomic(destPath, stringifyYaml(canonical));
  results.push({
    fromTool: CODEX_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
