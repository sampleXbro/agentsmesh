import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const CONFIG_FILE = 'agentsmesh.yaml';
const LOCAL_CONFIG_FILE = 'agentsmesh.local.yaml';

interface FeatureList {
  readonly file: string;
  readonly features: readonly unknown[];
}

function readMap(path: string): Record<string, unknown> | null {
  try {
    const raw: unknown = parseYaml(readFileSync(path, 'utf8'));
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The explicit `features` list `generate` will use, and the file it comes from.
 * Mirrors the config loader: a non-empty list in `agentsmesh.local.yaml` replaces
 * the project one. Null when there is no list (every feature is then on by
 * default) or the config cannot be read.
 */
function explicitFeatures(configDir: string): FeatureList | null {
  const project = readMap(join(configDir, CONFIG_FILE));
  if (project === null) return null;
  const local = readMap(join(configDir, LOCAL_CONFIG_FILE));
  if (Array.isArray(local?.features) && local.features.length > 0) {
    return { file: LOCAL_CONFIG_FILE, features: local.features };
  }
  return Array.isArray(project.features) ? { file: CONFIG_FILE, features: project.features } : null;
}

/**
 * Why the lessons recall hook cannot reach any tool, or null. `generate` projects
 * hooks only when `hooks` is in `features`, so without it the hook in hooks.yaml
 * is never written to a tool and nothing else says so.
 */
export function hooksFeatureOffWarning(configDir: string): string | null {
  const list = explicitFeatures(configDir);
  if (list === null || list.features.includes('hooks')) return null;
  return (
    `The lessons recall hook will not reach any tool: \`hooks\` is not in \`features\` in ${list.file}. ` +
    `Add \`hooks\` to \`features\` in ${list.file}, then run 'agentsmesh generate'.`
  );
}
