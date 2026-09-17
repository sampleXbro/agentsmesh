/**
 * Load canonical slice from one resolved extend (repo root + optional path).
 */

import { emptyCanonical } from '../load/empty-canonical.js';
import { join } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import type { ResolvedExtend } from '../../config/resolve/resolver.js';
import {
  detectNativeFormat,
  KNOWN_NATIVE_PATHS,
} from '../../config/resolve/native-format-detector.js';
import { exists } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';
import { loadCanonicalFiles } from '../load/loader.js';
import { importNativeToCanonical } from './native-extends-importer.js';
import { isSkillPackLayout, loadSkillsAtExtendPath } from '../load/skill-pack-load.js';
import { loadCanonicalSliceAtPath, normalizeSlicePath } from '../load/load-canonical-slice.js';
import { stageManualInstallScope } from '../../install/manual/manual-install-scope.js';

/**
 * Load canonical files contributed by one extend entry. Takes only the
 * discovery fields — the elevated-artifact consent gate (`isRemote`/`accept`)
 * is applied by the caller after this returns, so they are intentionally
 * excluded from the parameter type.
 */
export async function loadCanonicalForExtend(
  ext: Omit<ResolvedExtend, 'isRemote' | 'accept'>,
): Promise<CanonicalFiles> {
  const base = ext.resolvedPath;

  if (ext.as !== undefined) {
    const rawRoot = ext.path ? join(base, ext.path) : base;
    if (!(await exists(rawRoot))) {
      throw new Error(`Extend "${ext.name}": path does not exist: ${rawRoot}`);
    }
    const staged = await stageManualInstallScope(rawRoot, ext.as);
    try {
      return loadCanonicalFiles(join(staged.discoveryRoot, '.agentsmesh'));
    } finally {
      await staged.cleanup();
    }
  }

  if (!ext.path) {
    const agentsmeshDir = join(base, '.agentsmesh');
    if (!(await exists(agentsmeshDir))) {
      if (await isSkillPackLayout(base)) {
        const skills = await loadSkillsAtExtendPath(base);
        return { ...emptyCanonical(), skills };
      }
      const targetName = ext.target ?? (await detectNativeFormat(base));
      if (!targetName) {
        throw new Error(
          `Extend "${ext.name}": No supported agent configuration found in ${base}.\n` +
            `Expected one of: .agentsmesh/, ${KNOWN_NATIVE_PATHS.join(', ')}.`,
        );
      }
      logger.info(
        `[agentsmesh] Extend "${ext.name}": ${ext.target ? 'specified' : 'detected'} ${targetName} format, importing to .agentsmesh/...`,
      );
      await importNativeToCanonical(base, targetName);
    }
    return loadCanonicalFiles(base);
  }

  const rawRoot = join(base, ext.path);
  if (!(await exists(rawRoot))) {
    throw new Error(`Extend "${ext.name}": path does not exist: ${rawRoot}`);
  }

  if (ext.target) {
    const agentsmeshDir = join(base, '.agentsmesh');
    if (!(await exists(agentsmeshDir))) {
      logger.info(
        `[agentsmesh] Extend "${ext.name}": path "${ext.path}" with target "${ext.target}" — importing at extend root, then loading canonical.`,
      );
      await importNativeToCanonical(base, ext.target);
    }
    return loadCanonicalFiles(base);
  }

  const { sliceRoot } = await normalizeSlicePath(rawRoot);
  try {
    // Extends-path: target-mapper staging is left off because the returned
    // canonical files would reference tmpdir paths that need a lifecycle
    // tied to the entire extends-load → merge sequence. Install path uses
    // enableTargetCommandMappers via `discoverFromContentRoot`.
    const { canonical } = await loadCanonicalSliceAtPath(sliceRoot);
    return canonical;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`Extend "${ext.name}": ${msg}`);
    if (err instanceof Error) wrapped.cause = err;
    throw wrapped;
  }
}
