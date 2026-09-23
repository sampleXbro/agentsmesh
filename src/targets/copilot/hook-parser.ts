/**
 * Copilot hook parsing helpers — event mapping, wrapper command extraction, and hook import.
 */

import { AB_HOOKS } from '../../core/canonical-paths.js';
import { join, dirname, basename } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { stringify as yamlStringify } from 'yaml';
import { COPILOT_TARGET, COPILOT_HOOKS_DIR, COPILOT_LEGACY_HOOKS_DIR } from './constants.js';
import { CANONICAL_TO_COPILOT } from './hook-format.js';

const COPILOT_TO_CANONICAL = new Map<string, string>(
  [...CANONICAL_TO_COPILOT].map(([canonical, copilot]) => [copilot, canonical]),
);

export function mapCopilotHookEvent(event: string): string | null {
  return COPILOT_TO_CANONICAL.get(event) ?? null;
}

export function extractMatcher(comment: unknown): string {
  if (typeof comment !== 'string') return '*';
  const match = comment.match(/^Matcher:\s*(.+)$/);
  return match?.[1]?.trim() || '*';
}

export function extractWrapperCommand(content: string): string {
  const metadataMatch = content.match(/^# agentsmesh-command:\s*(.+)$/m);
  if (metadataMatch?.[1]) return metadataMatch[1].trim();
  return content
    .replace(/^#!.*\n/, '')
    .replace(/^#.*\n/gm, '')
    .replace(/^HOOK_DIR=.*\n/gm, '')
    .replace(/^set -e[u]?\n?/m, '')
    .trim();
}

/**
 * Extract a hook entry's matcher: prefers the real top-level `matcher` field
 * (docs.github.com/en/copilot/reference/hooks-configuration), falling back to
 * the legacy `comment: "Matcher: ..."` convention emitted by older agentsmesh
 * versions, for backwards-compatible import of previously-generated files.
 */
function extractEntryMatcher(entryRecord: Record<string, unknown>): string {
  if (typeof entryRecord.matcher === 'string' && entryRecord.matcher.length > 0) {
    return entryRecord.matcher;
  }
  return extractMatcher(entryRecord.comment);
}

export interface ImportHooksOptions {
  /** Hooks JSON directory, relative to projectRoot. Defaults to the project `.github/hooks`. */
  hooksDirRel?: string;
  /** Legacy shell-wrapper directory, relative to projectRoot. Pass `null` to skip
   * (there is no global equivalent of the legacy `.github/copilot-hooks/` convention). */
  legacyDirRel?: string | null;
}

/**
 * Import Copilot hook JSON configs (`.github/hooks/*.json` project scope, or
 * `.copilot/hooks/*.json` global scope — identical schema) into canonical
 * hooks.yaml. Project scope also supports legacy `.github/copilot-hooks/*.sh`
 * wrappers for backwards compatibility.
 */
export async function importHooks(
  projectRoot: string,
  results: ImportResult[],
  options: ImportHooksOptions = {},
): Promise<void> {
  const hooksDirRel = options.hooksDirRel ?? COPILOT_HOOKS_DIR;
  const legacyDirRel =
    options.legacyDirRel === undefined ? COPILOT_LEGACY_HOOKS_DIR : options.legacyDirRel;
  const hooksDir = join(projectRoot, hooksDirRel);
  const allFiles = await readDirRecursiveNoSymlinks(hooksDir).catch(() => []);
  const jsonFiles = allFiles.filter((file) => file.endsWith('.json'));
  const hooks: Record<string, Array<{ matcher: string; command: string; type: string }>> = {};

  for (const srcPath of jsonFiles) {
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed.hooks !== 'object' || parsed.hooks === null) continue;
    for (const [event, entries] of Object.entries(parsed.hooks as Record<string, unknown>)) {
      const canonicalEvent = mapCopilotHookEvent(event);
      if (!canonicalEvent || !Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const entryRecord = entry as Record<string, unknown>;
        const bashPath = typeof entryRecord.bash === 'string' ? entryRecord.bash : '';
        if (!bashPath) continue;
        const scriptPath = join(hooksDir, bashPath.replace(/^\.\//, ''));
        const scriptContent = await readFileSafe(scriptPath);
        if (!scriptContent) continue;
        const command = extractWrapperCommand(scriptContent);
        if (!command) continue;
        if (!hooks[canonicalEvent]) hooks[canonicalEvent] = [];
        hooks[canonicalEvent]!.push({
          matcher: extractEntryMatcher(entryRecord),
          command,
          type: 'command',
        });
      }
    }
  }

  if (legacyDirRel) {
    const legacyDir = join(projectRoot, legacyDirRel);
    const legacyFiles = await readDirRecursiveNoSymlinks(legacyDir).catch(() => []);
    const shFiles = legacyFiles.filter(
      (file) => dirname(file) === legacyDir && /^[^-]+-\d+\.sh$/i.test(basename(file)),
    );
    for (const srcPath of shFiles) {
      const content = await readFileSafe(srcPath);
      if (!content) continue;
      const name = basename(srcPath, '.sh');
      const dashIdx = name.lastIndexOf('-');
      const phase = dashIdx > 0 ? name.slice(0, dashIdx) : name;
      if (!hooks[phase]) hooks[phase] = [];
      hooks[phase]!.push({
        matcher: '*',
        command: extractWrapperCommand(content),
        type: 'command',
      });
    }
  }

  if (Object.keys(hooks).length === 0) return;

  const destPath = join(projectRoot, AB_HOOKS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, yamlStringify(hooks));
  results.push({
    fromTool: COPILOT_TARGET,
    fromPath: hooksDir,
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}
