import { resolve } from 'node:path';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import { McpError } from '../errors.js';
import { MAX_FILE_SIZE_BYTES } from '../limits.js';
import { assertContainedPath } from './path-containment.js';

export interface SafeWriteOptions {
  projectRoot: string;
  feature: 'rules' | 'commands' | 'agents' | 'skills';
  relativePath: string;
  content: string;
}

export async function safeWrite(opts: SafeWriteOptions): Promise<string> {
  const root = resolve(opts.projectRoot, '.agentsmesh', opts.feature);
  const target = resolve(root, opts.relativePath);
  await assertContainedPath({
    root,
    target,
    boundaryRoot: opts.projectRoot,
    message: `path escapes ${opts.feature} directory`,
  });
  if (Buffer.byteLength(opts.content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    throw new McpError('LIMIT_EXCEEDED', 'file body exceeds 1 MiB cap', {
      limit: MAX_FILE_SIZE_BYTES,
      actual: Buffer.byteLength(opts.content, 'utf8'),
    });
  }
  await writeFileAtomic(target, opts.content);
  return target;
}
