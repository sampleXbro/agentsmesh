/**
 * Import Windsurf `.windsurf/workflows/*.md` into canonical commands.
 */

import { AB_COMMANDS } from '../../core/canonical-paths.js';
import { join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedCommandWithFallback } from '../import/import-metadata.js';
import { WINDSURF_TARGET, WINDSURF_WORKFLOWS_DIR } from './constants.js';

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export async function importWorkflows(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const workflowsDir = join(projectRoot, WINDSURF_WORKFLOWS_DIR);
  const workflowFiles = await readDirRecursiveNoSymlinks(workflowsDir);
  const workflowMdFiles = workflowFiles.filter((f) => f.endsWith('.md'));
  const destCommandsDir = join(projectRoot, AB_COMMANDS);
  for (const srcPath of workflowMdFiles) {
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    const relativePath = relative(workflowsDir, srcPath).replace(/\\/g, '/');
    await mkdirp(destCommandsDir);
    const destPath = join(destCommandsDir, relativePath);
    const normalized = normalize(content, srcPath, destPath);
    const { frontmatter, body } = parseFrontmatter(normalized);
    const outContent = await serializeImportedCommandWithFallback(
      destPath,
      {
        description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
        hasDescription: Object.prototype.hasOwnProperty.call(frontmatter, 'description'),
        allowedTools: (() => {
          const fromCamel = toStringArray(frontmatter.allowedTools);
          return fromCamel.length > 0 ? fromCamel : toStringArray(frontmatter['allowed-tools']);
        })(),
        hasAllowedTools:
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowedTools') ||
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools'),
      },
      body,
    );
    await writeFileAtomic(destPath, outContent);
    results.push({
      fromTool: WINDSURF_TARGET,
      fromPath: srcPath,
      toPath: `${AB_COMMANDS}/${relativePath}`,
      feature: 'commands',
    });
  }
}
