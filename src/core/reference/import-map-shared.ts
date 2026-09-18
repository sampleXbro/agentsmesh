import { basename, posix } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { pathApi } from '../path-helpers.js';
import { readDirRecursive } from '../../utils/filesystem/fs.js';
import {
  CODEX_COMMAND_SKILL_PREFIX,
  LEGACY_CODEX_COMMAND_SKILL_PREFIX,
} from '../../targets/codex-cli/command-skill.js';
import {
  PROJECTED_AGENT_SKILL_PREFIX,
  LEGACY_PROJECTED_AGENT_SKILL_PREFIX,
} from '../../targets/projection/projected-agent-skill.js';
import { managedOutputPaths } from '../../targets/catalog/managed-outputs.js';

const AB_RULES = '.agentsmesh/rules';
const AB_COMMANDS = '.agentsmesh/commands';
const AB_AGENTS = '.agentsmesh/agents';
const AB_SKILLS = '.agentsmesh/skills';

export function rel(projectRoot: string, absPath: string): string {
  return pathApi(projectRoot).relative(projectRoot, absPath).replace(/\\/g, '/');
}

export async function listFiles(projectRoot: string, dir: string): Promise<string[]> {
  return readDirRecursive(pathApi(projectRoot).join(projectRoot, dir)).catch(() => []);
}

export function addDirectoryMapping(refs: Map<string, string>, from: string, to: string): void {
  refs.set(from, to);
  refs.set(`${from}/`, `${to}/`);
}

export function addAncestorMappings(
  refs: Map<string, string>,
  fromPath: string,
  toPath: string,
  stopDir: string,
): void {
  let fromDir = posix.dirname(fromPath);
  let toDir = posix.dirname(toPath);
  while (fromDir !== stopDir && fromDir !== '.') {
    addDirectoryMapping(refs, fromDir, toDir);
    fromDir = posix.dirname(fromDir);
    toDir = posix.dirname(toDir);
  }
}

export function addSimpleFileMapping(
  refs: Map<string, string>,
  fromPath: string,
  canonicalDir: string,
  extension: string,
): void {
  refs.set(fromPath, `${canonicalDir}/${basename(fromPath, extension)}.md`);
}

export function addSkillLikeMapping(
  refs: Map<string, string>,
  relPath: string,
  skillsDir: string,
): void {
  if (!relPath.startsWith(`${skillsDir}/`)) return;
  const rest = relPath.slice(skillsDir.length + 1);
  if (!rest) return;

  if (!rest.includes('/')) {
    if (!rest.endsWith('.md') || basename(rest) === 'SKILL.md') return;
    const name = basename(rest, '.md');
    refs.set(relPath, `${AB_SKILLS}/${name}/SKILL.md`);
    return;
  }

  const [dirName, ...tail] = rest.split('/');
  const filePath = tail.join('/');
  if (!dirName || !filePath) return;

  const commandPrefix = dirName.startsWith(CODEX_COMMAND_SKILL_PREFIX)
    ? CODEX_COMMAND_SKILL_PREFIX
    : dirName.startsWith(LEGACY_CODEX_COMMAND_SKILL_PREFIX)
      ? LEGACY_CODEX_COMMAND_SKILL_PREFIX
      : null;
  if (commandPrefix && filePath === 'SKILL.md') {
    refs.set(relPath, `${AB_COMMANDS}/${dirName.slice(commandPrefix.length)}.md`);
    return;
  }
  const agentPrefix = dirName.startsWith(PROJECTED_AGENT_SKILL_PREFIX)
    ? PROJECTED_AGENT_SKILL_PREFIX
    : dirName.startsWith(LEGACY_PROJECTED_AGENT_SKILL_PREFIX)
      ? LEGACY_PROJECTED_AGENT_SKILL_PREFIX
      : null;
  if (agentPrefix && filePath === 'SKILL.md') {
    refs.set(relPath, `${AB_AGENTS}/${dirName.slice(agentPrefix.length)}.md`);
    return;
  }

  const canonicalBase = `${AB_SKILLS}/${dirName}`;
  if (filePath === 'SKILL.md') addDirectoryMapping(refs, `${skillsDir}/${dirName}`, canonicalBase);
  const canonicalPath = `${canonicalBase}/${filePath}`;
  refs.set(relPath, canonicalPath);
  if (filePath !== 'SKILL.md') {
    addAncestorMappings(refs, relPath, canonicalPath, `${skillsDir}/${dirName}`);
  }
}

function firstPathSegment(path: string): string {
  return path.split('/').filter(Boolean)[0] ?? '';
}

let targetRootSegmentsCache: ReadonlySet<string> | undefined;

async function targetRootSegments(): Promise<ReadonlySet<string>> {
  if (targetRootSegmentsCache !== undefined) return targetRootSegmentsCache;
  const { BUILTIN_TARGETS } = await import('../../targets/catalog/builtin-targets.js');
  const roots = new Set<string>();
  for (const descriptor of BUILTIN_TARGETS) {
    for (const path of [
      descriptor.project.rootInstructionPath,
      descriptor.project.skillDir,
      ...managedOutputPaths(descriptor.project),
      ...descriptor.detectionPaths,
      descriptor.globalSupport?.layout.rootInstructionPath,
      descriptor.globalSupport?.layout.skillDir,
      ...managedOutputPaths(descriptor.globalSupport?.layout),
      ...(descriptor.globalSupport?.detectionPaths ?? []),
    ]) {
      if (path !== undefined) {
        const segment = firstPathSegment(path);
        if (segment.startsWith('.')) roots.add(segment);
      }
    }
  }
  targetRootSegmentsCache = roots;
  return roots;
}

function hasHiddenSegment(relPath: string): boolean {
  return relPath.split('/').some((segment) => segment.startsWith('.'));
}

async function listScopedAgentsFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const targetRootSegmentsSet = await targetRootSegments();
  const api = pathApi(projectRoot);

  async function walk(relDir: string): Promise<void> {
    const absDir = api.join(projectRoot, relDir);
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (targetRootSegmentsSet.has(entry.name) || hasHiddenSegment(relPath)) continue;
        await walk(relPath);
        continue;
      }
      if (
        entry.isSymbolicLink() &&
        (await stat(api.join(projectRoot, relPath)).then(
          (info) => info.isDirectory(),
          () => false,
        ))
      ) {
        if (targetRootSegmentsSet.has(entry.name) || hasHiddenSegment(relPath)) continue;
        await walk(relPath);
        continue;
      }
      if (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md') {
        files.push(api.join(projectRoot, relPath));
      }
    }
  }

  await walk('');
  return files;
}

export async function addScopedAgentsMappings(
  refs: Map<string, string>,
  projectRoot: string,
): Promise<void> {
  const files = await listScopedAgentsFiles(projectRoot);
  for (const absPath of files) {
    const relPath = rel(projectRoot, absPath);
    const isNestedAgents =
      relPath.endsWith('/AGENTS.md') &&
      relPath !== 'AGENTS.md' &&
      !relPath.endsWith('/AGENTS.override.md');
    const isNestedOverride =
      relPath.endsWith('/AGENTS.override.md') && relPath !== 'AGENTS.override.md';
    if (!isNestedAgents && !isNestedOverride) continue;
    const parentDir = posix.dirname(relPath);
    if (hasHiddenSegment(parentDir)) continue;
    const ruleName = parentDir.replace(/\//g, '-');
    refs.set(relPath, `${AB_RULES}/${ruleName}.md`);
  }
}
