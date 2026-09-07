import { parse as parseYaml } from 'yaml';
import { readFile } from 'node:fs/promises';
import { McpError } from '../errors.js';
import { MAX_FILE_SIZE_BYTES } from '../limits.js';
import { assertContainedPath } from './path-containment.js';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';

// Reject any config read/write whose resolved (symlink-followed) path escapes
// the project root — a symlinked config file OR a symlinked `.agentsmesh` parent
// dir must not leak or overwrite files outside the project. Anchoring at the
// project root (not `.agentsmesh`) is deliberate: a boundary of `.agentsmesh`
// would canonicalize through a symlinked `.agentsmesh` and cancel.
export async function assertWithinProject(projectRoot: string, target: string): Promise<void> {
  await assertContainedPath({
    root: projectRoot,
    target,
    message: 'config path escapes project directory',
  });
}

export async function readYaml<T>(projectRoot: string, path: string): Promise<T | null> {
  await assertWithinProject(projectRoot, path);
  try {
    return parseYaml(await readFile(path, 'utf8')) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new McpError('IO_ERROR', 'failed to read yaml');
  }
}

export async function atomicWrite(
  projectRoot: string,
  path: string,
  content: string,
): Promise<void> {
  await assertWithinProject(projectRoot, path);
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    throw new McpError('LIMIT_EXCEEDED', 'file exceeds 1 MiB cap');
  }
  await writeFileAtomic(path, content);
}
