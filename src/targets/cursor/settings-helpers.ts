/**
 * Cursor settings import helpers — permissions, hooks, and ignore file processing.
 */

import { AB_HOOKS, AB_IGNORE, AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { join, dirname } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { cursorHooksToCanonical } from './hook-format.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { stringify as yamlStringify } from 'yaml';
import {
  CURSOR_SETTINGS,
  CURSOR_CLI_JSON,
  CURSOR_GLOBAL_CLI_CONFIG,
  CURSOR_HOOKS,
  CURSOR_IGNORE,
  CURSOR_INDEXING_IGNORE,
} from './constants.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';

export { cursorHooksToCanonical };

export async function importSettings(
  projectRoot: string,
  results: ImportResult[],
  scope: TargetLayoutScope = 'project',
): Promise<void> {
  let hooksImportedFromHooksJson = false;
  const hooksJsonPath = join(projectRoot, CURSOR_HOOKS);
  const hooksJsonContent = await readFileSafe(hooksJsonPath);
  if (hooksJsonContent) {
    try {
      const hooksFile = JSON.parse(hooksJsonContent) as Record<string, unknown>;
      if (hooksFile.hooks && typeof hooksFile.hooks === 'object') {
        const canonical = cursorHooksToCanonical(hooksFile.hooks as Record<string, unknown>);
        if (Object.keys(canonical).length > 0) {
          const hooksContent = yamlStringify(canonical);
          const destPath = join(projectRoot, AB_HOOKS);
          await mkdirp(dirname(destPath));
          await writeFileAtomic(destPath, hooksContent);
          results.push({
            fromTool: 'cursor',
            fromPath: hooksJsonPath,
            toPath: AB_HOOKS,
            feature: 'hooks',
          });
          hooksImportedFromHooksJson = true;
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // Permissions: read from the scope-appropriate CLI config file.
  // Project scope: .cursor/cli.json; Global scope: .cursor/cli-config.json
  // (per https://cursor.com/docs/cli/reference/permissions — distinct filenames).
  const cliPermPath = scope === 'global' ? CURSOR_GLOBAL_CLI_CONFIG : CURSOR_CLI_JSON;
  const cliJsonPath = join(projectRoot, cliPermPath);
  const cliContent = await readFileSafe(cliJsonPath);
  if (cliContent) {
    try {
      const cliJson = JSON.parse(cliContent) as Record<string, unknown>;
      const rawPerms = cliJson.permissions;
      if (rawPerms && typeof rawPerms === 'object' && !Array.isArray(rawPerms)) {
        const perms = rawPerms as Record<string, unknown>;
        const allow = Array.isArray(perms.allow)
          ? (perms.allow as string[]).filter((s) => typeof s === 'string')
          : [];
        const deny = Array.isArray(perms.deny)
          ? (perms.deny as string[]).filter((s) => typeof s === 'string')
          : [];
        if (allow.length > 0 || deny.length > 0) {
          const permContent = yamlStringify({ allow, deny });
          const destPath = join(projectRoot, AB_PERMISSIONS);
          await mkdirp(dirname(destPath));
          await writeFileAtomic(destPath, permContent);
          results.push({
            fromTool: 'cursor',
            fromPath: cliJsonPath,
            toPath: AB_PERMISSIONS,
            feature: 'permissions',
          });
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // Hooks fallback: read from .cursor/settings.json only when hooks.json
  // was not found (legacy Cursor versions stored hooks there).
  if (!hooksImportedFromHooksJson) {
    const settingsPath = join(projectRoot, CURSOR_SETTINGS);
    const settingsContent = await readFileSafe(settingsPath);
    if (settingsContent) {
      try {
        const settings = JSON.parse(settingsContent) as Record<string, unknown>;
        const rawHooks = settings.hooks;
        if (rawHooks && typeof rawHooks === 'object' && !Array.isArray(rawHooks)) {
          const canonicalHooks = cursorHooksToCanonical(rawHooks as Record<string, unknown>);
          if (Object.keys(canonicalHooks).length > 0) {
            const hooksContent = yamlStringify(canonicalHooks);
            const destPath = join(projectRoot, AB_HOOKS);
            await mkdirp(dirname(destPath));
            await writeFileAtomic(destPath, hooksContent);
            results.push({
              fromTool: 'cursor',
              fromPath: settingsPath,
              toPath: AB_HOOKS,
              feature: 'hooks',
            });
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  }
}

export async function importIgnore(projectRoot: string, results: ImportResult[]): Promise<void> {
  const sources = [
    { path: join(projectRoot, CURSOR_IGNORE), label: CURSOR_IGNORE },
    { path: join(projectRoot, CURSOR_INDEXING_IGNORE), label: CURSOR_INDEXING_IGNORE },
  ];
  const patterns: string[] = [];
  const importedFrom: string[] = [];
  for (const source of sources) {
    const content = await readFileSafe(source.path);
    if (content === null) continue;
    importedFrom.push(source.label);
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !patterns.includes(trimmed)) {
        patterns.push(trimmed);
      }
    }
  }
  if (patterns.length === 0) return;
  const destPath = join(projectRoot, AB_IGNORE);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, patterns.join('\n') + '\n');
  results.push({
    fromTool: 'cursor',
    fromPath: join(projectRoot, importedFrom[0]!),
    toPath: AB_IGNORE,
    feature: 'ignore',
  });
}
