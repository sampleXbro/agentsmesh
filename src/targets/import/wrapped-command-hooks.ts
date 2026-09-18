/**
 * Shared serialization + import for the "wrapped" command-hook format used by
 * targets that nest hook events under a top-level `"hooks"` key (codex-cli,
 * factory-droid):
 *
 *   { "hooks": { "<Event>": [{ "matcher", "hooks": [{ "type": "command", "command", "timeout"? }] }] } }
 *
 * Command-only by design — `prompt`/`agent` handlers have no on-disk equivalent
 * in these tools and are dropped on both the generate and import sides so the
 * round-trip stays symmetric.
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { CanonicalFiles, ImportResult } from '../../core/types.js';
import { getHookCommand, hasHookCommand } from '../../core/hook-command.js';
import { readFileSafe, mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';

export type WrappedHookOutput = FeatureGeneratorOutput;

export function buildWrappedCommandHooks(
  canonical: CanonicalFiles,
  hooksFilePath: string,
  options?: { readonly supportedEvents?: readonly string[] },
): WrappedHookOutput[] {
  if (!canonical.hooks) return [];
  const supported = options?.supportedEvents ? new Set(options.supportedEvents) : null;
  const hooks: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    if (supported && !supported.has(event)) continue;
    if (!Array.isArray(entries)) continue;
    const mapped = entries.flatMap((entry) => {
      if (!hasHookCommand(entry) || entry.type === 'prompt') return [];
      const hook: Record<string, unknown> = { type: 'command', command: getHookCommand(entry) };
      if (entry.timeout !== undefined) hook.timeout = entry.timeout;
      return [{ matcher: entry.matcher, hooks: [hook] }];
    });
    if (mapped.length > 0) hooks[event] = mapped;
  }
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: hooksFilePath, content: JSON.stringify({ hooks }, null, 2) }];
}

interface ImportedHook {
  matcher: string;
  command: string;
  type: 'command';
  timeout?: number;
}

export async function importWrappedCommandHooks(options: {
  projectRoot: string;
  hooksFile: string;
  canonicalHooksPath: string;
  targetName: string;
  results: ImportResult[];
}): Promise<void> {
  const { projectRoot, hooksFile, canonicalHooksPath, targetName, results } = options;
  const srcPath = join(projectRoot, hooksFile);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const rawHooks = (parsed as Record<string, unknown>).hooks;
  if (!rawHooks || typeof rawHooks !== 'object' || Array.isArray(rawHooks)) return;
  const hooks: Record<string, ImportedHook[]> = {};
  for (const [event, groups] of Object.entries(rawHooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const record = group as Record<string, unknown>;
      const matcher = typeof record.matcher === 'string' ? record.matcher : '*';
      if (!Array.isArray(record.hooks)) continue;
      for (const raw of record.hooks) {
        if (!raw || typeof raw !== 'object') continue;
        const hook = raw as Record<string, unknown>;
        if (hook.type !== 'command' || typeof hook.command !== 'string') continue;
        const imported: ImportedHook = { matcher, command: hook.command, type: 'command' };
        if (typeof hook.timeout === 'number') imported.timeout = hook.timeout;
        (hooks[event] ??= []).push(imported);
      }
    }
  }
  if (Object.keys(hooks).length === 0) return;
  const destPath = join(projectRoot, canonicalHooksPath);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, stringifyYaml(hooks));
  results.push({
    fromTool: targetName,
    fromPath: srcPath,
    toPath: canonicalHooksPath,
    feature: 'hooks',
  });
}
