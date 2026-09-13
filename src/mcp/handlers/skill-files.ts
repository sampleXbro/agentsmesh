import { resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { McpError } from '../errors.js';
import { MAX_FILE_SIZE_BYTES } from '../limits.js';
import { assertContainedPath } from '../writers/path-containment.js';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';

const NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;
const SUPPORT_PATH_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_/-]*\.[a-zA-Z0-9]+$/;

export function checkName(name: string): void {
  if (!NAME_RE.test(name)) throw new McpError('INVALID_NAME', `invalid skill name: ${name}`);
}

export function checkSupportPath(path: string): void {
  if (!SUPPORT_PATH_RE.test(path) || path.includes('..') || path.includes('//')) {
    throw new McpError('PATH_TRAVERSAL', `invalid supporting-file path: ${path}`);
  }
}

export const skillsDir = (root: string): string => resolve(root, '.agentsmesh/skills');
export const skillDir = (root: string, name: string): string => resolve(skillsDir(root), name);

export async function assertSkillFile(
  projectRoot: string,
  dir: string,
  target: string,
): Promise<void> {
  await assertContainedPath({
    root: dir,
    target,
    boundaryRoot: projectRoot,
    message: 'file escapes skill directory',
  });
}

async function validateSkillFile(
  projectRoot: string,
  dir: string,
  target: string,
  content: string | null,
): Promise<void> {
  await assertSkillFile(projectRoot, dir, target);
  if (content !== null && Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    throw new McpError('LIMIT_EXCEEDED', 'file body exceeds 1 MiB cap');
  }
  try {
    if ((await lstat(target)).isDirectory())
      throw new McpError('IO_ERROR', 'supporting path is a directory');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function validateSkillFiles(
  projectRoot: string,
  dir: string,
  primary: string,
  support: Record<string, string | null>,
): Promise<void> {
  await validateSkillFile(projectRoot, dir, resolve(dir, 'SKILL.md'), primary);
  for (const [path, content] of Object.entries(support)) {
    checkSupportPath(path);
    if (path.toLowerCase() === 'skill.md') {
      throw new McpError('PATH_TRAVERSAL', 'SKILL.md cannot be changed through supportingFiles');
    }
    await validateSkillFile(projectRoot, dir, resolve(dir, path), content);
  }
}

export async function atomicWrite(
  projectRoot: string,
  dir: string,
  target: string,
  content: string,
): Promise<void> {
  await validateSkillFile(projectRoot, dir, target, content);
  await writeFileAtomic(target, content);
}
