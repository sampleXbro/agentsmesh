import { mkdir, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';

/** Stage and swap using paths owned exclusively by this operation. */
export async function swapPackDirectory<T>(
  packsDir: string,
  packName: string,
  writeStaging: (stagingDir: string) => Promise<T>,
): Promise<T> {
  await mkdir(packsDir, { recursive: true });
  const transactionDir = await mkdtemp(join(packsDir, '.agentsmesh-install-'));
  const stagingDir = join(transactionDir, 'new');
  const backupDir = join(transactionDir, 'old');
  const finalDir = join(packsDir, packName);
  let swappedOut = false;
  try {
    await mkdir(stagingDir);
    const result = await writeStaging(stagingDir);
    if (await exists(finalDir)) {
      await rename(finalDir, backupDir);
      swappedOut = true;
    }
    try {
      await rename(stagingDir, finalDir);
    } catch (err) {
      if (swappedOut) {
        await rename(backupDir, finalDir).catch((restoreErr: unknown) => {
          const detail = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
          logger.warn(
            'Failed to restore the previous pack after a failed atomic swap; ' +
              `the prior contents remain at "${backupDir.replaceAll('\\', '/')}". ` +
              `Recover them manually. (${detail})`,
          );
        });
      }
      throw err;
    }
    if (swappedOut) await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    return result;
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  } finally {
    // Remove only an empty transaction; a failed restore must retain its backup.
    await rmdir(transactionDir).catch(() => {});
  }
}
