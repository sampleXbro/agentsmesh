import { AB_AGENTS, AB_COMMANDS, AB_MCP, AB_RULES } from '../../core/canonical-paths.js';
import { join, dirname } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
  exists,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import {
  CURSOR_GLOBAL_USER_RULES,
  CURSOR_MCP,
  CURSOR_SKILLS_DIR,
  CURSOR_AGENTS_DIR,
  CURSOR_COMMANDS_DIR,
  CURSOR_RULES_DIR,
  CURSOR_DOT_CURSOR_AGENTS,
  CURSOR_HOOKS,
  CURSOR_IGNORE,
} from './constants.js';
import { importCursorRootFile } from './import-root-helpers.js';
import { mapCursorAgentFile, mapCursorCommandFile, mapCursorRuleFile } from './importer-mappers.js';

export const CURSOR_TARGET = 'cursor';

export async function hasGlobalCursorArtifacts(projectRoot: string): Promise<boolean> {
  if (await exists(join(projectRoot, CURSOR_RULES_DIR))) return true;
  const candidates = [
    join(projectRoot, CURSOR_DOT_CURSOR_AGENTS),
    join(projectRoot, CURSOR_GLOBAL_USER_RULES),
    join(projectRoot, CURSOR_MCP),
    join(projectRoot, CURSOR_HOOKS),
    join(projectRoot, CURSOR_IGNORE),
  ];
  for (const p of candidates) {
    const content = await readFileSafe(p);
    if (content !== null && content.trim() !== '') return true;
  }
  // Directories are probed by listing below; readFileSafe on a directory raises EISDIR.
  const skillFiles = await readDirRecursiveNoSymlinks(join(projectRoot, CURSOR_SKILLS_DIR));
  if (skillFiles.some((f) => f.endsWith('.md'))) return true;
  const agentFiles = await readDirRecursiveNoSymlinks(join(projectRoot, CURSOR_AGENTS_DIR));
  if (agentFiles.some((f) => f.endsWith('.md'))) return true;
  const commandFiles = await readDirRecursiveNoSymlinks(join(projectRoot, CURSOR_COMMANDS_DIR));
  if (commandFiles.some((f) => f.endsWith('.md'))) return true;
  return false;
}

export async function importGlobalCursorRulesFromDir(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<boolean> {
  const destDir = join(projectRoot, AB_RULES);
  let rootWritten = false;
  const rulesDir = join(projectRoot, CURSOR_RULES_DIR);
  const batch = await importFileDirectory({
    srcDir: rulesDir,
    destDir,
    extensions: ['.mdc'],
    fromTool: CURSOR_TARGET,
    normalize,
    mapEntry: async ({ srcPath, relativePath, normalizeTo }) => {
      if (rootWritten) {
        const raw = await readFileSafe(srcPath);
        if (raw !== null) {
          const { frontmatter } = parseFrontmatter(raw);
          if (frontmatter.alwaysApply === true) return null;
        }
      }
      return mapCursorRuleFile(relativePath, destDir, normalizeTo, () => {
        rootWritten = true;
      });
    },
  });
  results.push(...batch);
  return rootWritten;
}

export async function importGlobalUserRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<boolean> {
  const srcPath = join(projectRoot, CURSOR_GLOBAL_USER_RULES);
  const raw = await readFileSafe(srcPath);
  if (raw === null || raw.trim() === '') return false;
  return importCursorRootFile({
    projectRoot,
    results,
    sourcePath: srcPath,
    content: raw.trim(),
    normalize,
  });
}

export async function importGlobalDotCursorAgents(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<boolean> {
  const srcPath = join(projectRoot, CURSOR_DOT_CURSOR_AGENTS);
  const raw = await readFileSafe(srcPath);
  if (raw === null || raw.trim() === '') return false;
  return importCursorRootFile({
    projectRoot,
    results,
    sourcePath: srcPath,
    content: raw.trim(),
    normalize,
  });
}

export async function importGlobalMcp(projectRoot: string, results: ImportResult[]): Promise<void> {
  const mcpPath = join(projectRoot, CURSOR_MCP);
  const content = await readFileSafe(mcpPath);
  if (content === null || content.trim() === '') return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !('mcpServers' in (parsed as object))) return;
  const destPath = join(projectRoot, AB_MCP);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, content);
  results.push({
    fromTool: CURSOR_TARGET,
    fromPath: mcpPath,
    toPath: AB_MCP,
    feature: 'mcp',
  });
}

export async function importGlobalAgents(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const agentsDir = join(projectRoot, CURSOR_AGENTS_DIR);
  const destDir = join(projectRoot, AB_AGENTS);
  results.push(
    ...(await importFileDirectory({
      srcDir: agentsDir,
      destDir,
      extensions: ['.md'],
      fromTool: CURSOR_TARGET,
      normalize,
      mapEntry: ({ relativePath, normalizeTo }) =>
        mapCursorAgentFile(relativePath, destDir, normalizeTo),
    })),
  );
}

export async function importGlobalCommands(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const commandsDir = join(projectRoot, CURSOR_COMMANDS_DIR);
  const destDir = join(projectRoot, AB_COMMANDS);
  results.push(
    ...(await importFileDirectory({
      srcDir: commandsDir,
      destDir,
      extensions: ['.md'],
      fromTool: CURSOR_TARGET,
      normalize,
      mapEntry: ({ relativePath, normalizeTo }) =>
        mapCursorCommandFile(relativePath, destDir, normalizeTo),
    })),
  );
}
