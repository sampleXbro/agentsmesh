import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { parse as parseToml } from 'smol-toml';
import { stringify as stringifyYaml } from 'yaml';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { GEMINI_TARGET, GEMINI_POLICIES_DIR } from './constants.js';

function unescapeRegexLiteral(value: string): string {
  // Reverse of escapeRegexLiteral: `\.` -> `.`, `\/` -> `/`, etc.
  return value.replace(/\\(.)/g, '$1');
}

function toolNameToPermissionBase(
  toolName: string,
): 'Read' | 'Grep' | 'LS' | 'WebFetch' | 'Bash' | null {
  switch (toolName) {
    case 'read_file':
      return 'Read';
    case 'grep_search':
      return 'Grep';
    case 'list_directory':
      return 'LS';
    case 'web_fetch':
      return 'WebFetch';
    case 'run_shell_command':
      return 'Bash';
    default:
      return null;
  }
}

function commandPrefixToBashExpr(prefix: string): string {
  return `Bash(${prefix}:*)`;
}

function argsPatternToReadExpr(argsPattern: string): string {
  return `Read(${unescapeRegexLiteral(argsPattern)})`;
}

export async function importGeminiPolicies(projectRoot: string): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  const policiesDir = join(projectRoot, GEMINI_POLICIES_DIR);
  let policyFiles: string[];
  try {
    policyFiles = await readDirRecursiveNoSymlinks(policiesDir);
  } catch {
    return results;
  }

  const tomlFiles = policyFiles.filter((f) => f.endsWith('.toml'));
  if (tomlFiles.length === 0) return results;

  const allow: string[] = [];
  const deny: string[] = [];
  const allowSet = new Set<string>();
  const denySet = new Set<string>();

  for (const policyPath of tomlFiles) {
    const content = await readFileSafe(policyPath);
    if (!content) continue;

    let parsed: unknown;
    try {
      parsed = parseToml(content) as unknown;
    } catch {
      continue;
    }

    const rules = (
      parsed && typeof parsed === 'object' && 'rule' in parsed
        ? (parsed as { rule?: unknown }).rule
        : undefined
    ) as unknown;
    if (!Array.isArray(rules)) continue;

    for (const rawRule of rules) {
      if (!rawRule || typeof rawRule !== 'object') continue;
      const rule = rawRule as Record<string, unknown>;

      const toolName = typeof rule.toolName === 'string' ? rule.toolName : null;
      const decision = typeof rule.decision === 'string' ? rule.decision : null;
      if (!toolName || !decision) continue;

      const base = toolNameToPermissionBase(toolName);
      if (!base) continue;

      let expr: string | null = null;
      if (base === 'Bash') {
        if (typeof rule.commandPrefix === 'string' && rule.commandPrefix.trim()) {
          expr = commandPrefixToBashExpr(rule.commandPrefix.trim());
        }
      } else if (base === 'Read') {
        if (typeof rule.argsPattern === 'string' && rule.argsPattern.trim()) {
          expr = argsPatternToReadExpr(rule.argsPattern.trim());
        } else {
          expr = 'Read';
        }
      } else {
        expr = base;
      }

      if (!expr) continue;

      if (decision === 'allow') {
        if (!allowSet.has(expr)) {
          allowSet.add(expr);
          allow.push(expr);
        }
      } else if (decision === 'deny') {
        if (!denySet.has(expr)) {
          denySet.add(expr);
          deny.push(expr);
        }
      }
    }
  }

  if (allow.length === 0 && deny.length === 0) return results;

  await mkdirp(join(projectRoot, '.agentsmesh'));
  const outPath = join(projectRoot, AB_PERMISSIONS);
  const yaml = stringifyYaml({ allow, deny });
  await writeFileAtomic(outPath, yaml.trimEnd() + '\n');

  results.push({
    fromTool: GEMINI_TARGET,
    fromPath: join(projectRoot, GEMINI_POLICIES_DIR),
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });

  return results;
}
