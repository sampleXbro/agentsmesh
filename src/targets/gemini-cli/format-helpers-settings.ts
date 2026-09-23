import { AB_HOOKS, AB_IGNORE, AB_MCP } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ImportResult } from '../../core/types.js';
import { getHookCommand, hasHookCommand } from '../../core/hook-command.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { GEMINI_SETTINGS } from './constants.js';
import { fromGeminiMatcher, mapGeminiHookEvent } from './hook-map.js';

export async function importGeminiSettings(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const settingsPath = join(projectRoot, GEMINI_SETTINGS);
  const settingsContent = await readFileSafe(settingsPath);
  if (settingsContent === null) return;

  let settings: Record<string, unknown> | undefined;
  try {
    settings = JSON.parse(settingsContent) as Record<string, unknown>;
  } catch {
    // skip malformed settings
  }
  if (!settings) return;

  const mcpServers = settings.mcpServers;
  if (
    mcpServers !== undefined &&
    typeof mcpServers === 'object' &&
    mcpServers !== null &&
    Object.keys(mcpServers).length > 0
  ) {
    const mcpPath = join(projectRoot, AB_MCP);
    await mkdirp(join(projectRoot, '.agentsmesh'));
    await writeFileAtomic(mcpPath, JSON.stringify({ mcpServers: mcpServers }, null, 2));
    results.push({
      fromTool: 'gemini-cli',
      fromPath: settingsPath,
      toPath: AB_MCP,
      feature: 'mcp',
    });
  }

  const ignorePatterns = settings.ignorePatterns;
  if (
    Array.isArray(ignorePatterns) &&
    ignorePatterns.length > 0 &&
    ignorePatterns.every((p): p is string => typeof p === 'string')
  ) {
    const ignorePath = join(projectRoot, AB_IGNORE);
    await mkdirp(join(projectRoot, '.agentsmesh'));
    await writeFileAtomic(ignorePath, ignorePatterns.join('\n') + '\n');
    results.push({
      fromTool: 'gemini-cli',
      fromPath: settingsPath,
      toPath: AB_IGNORE,
      feature: 'ignore',
    });
  }

  const hooks = settings.hooks;
  if (hooks !== undefined && typeof hooks === 'object' && hooks !== null) {
    const mappedHooks = Object.entries(hooks as Record<string, unknown>).flatMap(
      ([event, value]) => {
        const canonicalEvent = mapGeminiHookEvent(event);
        if (!canonicalEvent || !Array.isArray(value)) return [];
        const mapped = value
          .filter(
            (entry): entry is Record<string, unknown> =>
              entry !== null &&
              typeof entry === 'object' &&
              typeof entry.matcher === 'string' &&
              Array.isArray(entry.hooks),
          )
          .flatMap((entry) =>
            (entry.hooks as unknown[])
              .filter(
                (hook): hook is Record<string, unknown> =>
                  hook !== null && typeof hook === 'object' && hasHookCommand(hook),
              )
              .map((hook) => ({
                matcher: fromGeminiMatcher(event, entry.matcher as string),
                command: getHookCommand(hook),
                type: 'command',
                timeout: typeof hook.timeout === 'number' ? hook.timeout : undefined,
              })),
          );
        if (mapped.length === 0) {
          const legacyMapped = value
            .filter(
              (entry): entry is Record<string, unknown> =>
                entry !== null &&
                typeof entry === 'object' &&
                typeof entry.matcher === 'string' &&
                hasHookCommand(entry),
            )
            .map((entry) => ({
              matcher: fromGeminiMatcher(event, entry.matcher as string),
              command: getHookCommand(entry),
              type: 'command',
            }));
          return legacyMapped.length > 0 ? [[canonicalEvent, legacyMapped] as const] : [];
        }
        return mapped.length > 0 ? [[canonicalEvent, mapped] as const] : [];
      },
    );
    if (mappedHooks.length > 0) {
      const hooksYaml = Object.fromEntries(mappedHooks);
      const hooksPath = join(projectRoot, AB_HOOKS);
      await mkdirp(join(projectRoot, '.agentsmesh'));
      await writeFileAtomic(hooksPath, stringifyYaml(hooksYaml, { lineWidth: 0 }).trimEnd());
      results.push({
        fromTool: 'gemini-cli',
        fromPath: settingsPath,
        toPath: AB_HOOKS,
        feature: 'hooks',
      });
    }
  }
}
