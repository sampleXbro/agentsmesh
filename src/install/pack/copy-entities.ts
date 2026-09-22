import { join, basename } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { mkdirp } from '../../utils/filesystem/fs.js';

/**
 * Copy each entity's source file into `packDir/<subdirectory>/`, flattened to
 * its basename.
 *
 * Rules, commands and agents all materialize this way, and both the pack writer
 * (fresh pack) and the pack merger (incremental) needed it — six copies of the
 * same four lines, differing only in the subdirectory name. Skills are not here:
 * they nest a directory per skill and carry supporting files.
 */
export async function copyEntitiesInto(
  packDir: string,
  subdirectory: string,
  entities: readonly { source: string }[],
): Promise<void> {
  if (entities.length === 0) return;
  const dir = join(packDir, subdirectory);
  await mkdirp(dir);
  for (const entity of entities) {
    await copyFile(entity.source, join(dir, basename(entity.source)));
  }
}
