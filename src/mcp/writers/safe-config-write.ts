import { resolve } from 'node:path';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import { McpError } from '../errors.js';
import { MAX_FILE_SIZE_BYTES } from '../limits.js';
import { assertContainedPath } from './path-containment.js';

export async function safeConfigWrite(opts: {
  projectRoot: string;
  content: string;
  filename?: 'agentsmesh.yaml';
}): Promise<string> {
  if (opts.filename !== undefined && opts.filename !== 'agentsmesh.yaml') {
    throw new McpError('PATH_TRAVERSAL', 'only agentsmesh.yaml is writable');
  }
  if (Buffer.byteLength(opts.content, 'utf8') > MAX_FILE_SIZE_BYTES) {
    throw new McpError('LIMIT_EXCEEDED', 'config exceeds 1 MiB cap');
  }
  const target = resolve(opts.projectRoot, 'agentsmesh.yaml');
  await assertContainedPath({
    root: opts.projectRoot,
    target,
    message: 'config path escapes project directory',
  });
  await writeFileAtomic(target, opts.content);
  return target;
}
