/**
 * Infer extends.pick from native files under pathInRepo (all install-supported targets).
 *
 * Target-specific behavior is declared on each descriptor's `nativeInstall`
 * block (pick paths + custom resolvers) — this module carries no target-id
 * literals (arch §3.1).
 */

import { basename, join } from 'node:path';
import type { ExtendPick } from '../../config/core/schema.js';
import type {
  NativePickRule,
  NativePickStrategy,
} from '../../targets/catalog/target-descriptor.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { readDirRecursiveNoSymlinks } from '../../utils/filesystem/fs.js';
import { skillNamesFromNativeSkillDir } from './native-skill-scan.js';

async function namesForStrategy(
  scan: string,
  posixPath: string,
  rule: NativePickRule,
  strategy: NativePickStrategy,
): Promise<string[]> {
  if (strategy.kind === 'skillDir') {
    return skillNamesFromNativeSkillDir(scan);
  }
  if (strategy.kind === 'firstSegment') {
    const rel = posixPath.slice(rule.prefix.length);
    const first = rel.split('/').filter(Boolean)[0];
    return first ? [first] : [];
  }
  const files = await readDirRecursiveNoSymlinks(scan);
  const suffix = strategy.suffix;
  const suffixLower = suffix.toLowerCase();
  return [
    ...new Set(
      files.filter((f) => f.toLowerCase().endsWith(suffixLower)).map((f) => basename(f, suffix)),
    ),
  ].sort();
}

export async function inferImplicitPickFromNativePath(
  repoRoot: string,
  pathInRepoPosix: string,
  target: string,
): Promise<ExtendPick> {
  const nativeInstall = getDescriptor(target)?.nativeInstall;
  if (!nativeInstall) return {};

  const posixPath = pathInRepoPosix.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  if (nativeInstall.inferPick) {
    return nativeInstall.inferPick(repoRoot, posixPath);
  }

  for (const rule of nativeInstall.pickPaths ?? []) {
    if (posixPath !== rule.prefix && !posixPath.startsWith(rule.prefix)) continue;
    const scan = join(repoRoot, ...posixPath.split('/'));
    const names = await namesForStrategy(scan, posixPath, rule, rule.strategy);
    return names.length ? { [rule.feature]: names } : {};
  }

  return {};
}
