/**
 * Stage native repos for install discovery without mutating the source checkout.
 * Scoped native paths are resolved from importer results; canonical paths still use slice loading.
 */

import { join } from 'node:path';
import type { ExtendPick } from '../../config/core/schema.js';
import { targetSchema } from '../../config/core/schema.js';
import { detectNativeFormat } from '../../config/resolve/native-format-detector.js';
import { exists } from '../../utils/filesystem/fs.js';
import {
  pathSupportsNativePick,
  validateTargetMatchesPath,
  extendPickHasArrays,
  targetHintFromNativePath,
} from '../native/native-path-pick.js';
import { inferImplicitPickFromNativePath } from '../native/native-path-pick-infer.js';
import {
  stageImportedNativeRepo,
  stageNativeInstallScope,
} from '../native/native-install-scope.js';

export interface PrepareInstallDiscoveryResult {
  discoveryRoot: string;
  implicitPick?: ExtendPick;
  scopedFeatures?: string[];
  /** Written to extends.target when native import or path-scoped install applies */
  yamlTarget?: string;
  importHappened: boolean;
  cleanup?: () => Promise<void>;
}

/**
 * Resolve where to run slice/canonical discovery and optional implicit pick for scoped paths.
 */
export async function prepareInstallDiscovery(
  repoRoot: string,
  contentRoot: string,
  pathInRepo: string,
  options: { explicitTarget?: string },
): Promise<PrepareInstallDiscoveryResult> {
  const explicitTarget = options.explicitTarget?.trim();
  if (explicitTarget) {
    targetSchema.parse(explicitTarget);
  }

  const posixPath = pathInRepo.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  validateTargetMatchesPath(explicitTarget, posixPath);

  const agentsmeshAtRoot = join(repoRoot, '.agentsmesh');
  const hasAbRoot = await exists(agentsmeshAtRoot);
  const pathHint = posixPath ? targetHintFromNativePath(posixPath) : undefined;
  // R-3: when `--path` narrows to a non-native subdirectory and the user did
  // NOT explicitly choose a target, suppress root-level `detectNativeFormat`.
  // Otherwise a repo with a root `CLAUDE.md` and a sibling `skills/` folder
  // forces `--path skills` to be treated as a claude-code subset and fails
  // with "No installable native resources" instead of letting the subdir be
  // classified on its own (e.g. as an Anthropic skill pack).
  const allowRootDetection =
    !hasAbRoot && !explicitTarget && (!posixPath || pathHint !== undefined);
  const detectedTarget = allowRootDetection
    ? ((await detectNativeFormat(repoRoot)) ?? undefined)
    : undefined;

  if (!explicitTarget && pathHint && detectedTarget && pathHint !== detectedTarget) {
    throw new Error(
      `Install path suggests native layout "${pathHint}" but auto-detect imported "${detectedTarget}". ` +
        `Use --target ${pathHint} for this path, or install from the repo root without a conflicting subtree path.`,
    );
  }

  const effectiveTarget = explicitTarget ?? pathHint ?? detectedTarget;
  const shouldStageNativeScope =
    Boolean(posixPath) && Boolean(effectiveTarget) && !posixPath.startsWith('.agentsmesh');

  if (!hasAbRoot && effectiveTarget) {
    if (shouldStageNativeScope) {
      const staged = await stageNativeInstallScope(repoRoot, posixPath, effectiveTarget);
      return {
        discoveryRoot: staged.stageRoot,
        implicitPick: staged.pick,
        scopedFeatures: staged.features,
        yamlTarget: effectiveTarget,
        importHappened: true,
        cleanup: staged.cleanup,
      };
    }

    const staged = await stageImportedNativeRepo(repoRoot, effectiveTarget);
    return {
      discoveryRoot: posixPath ? join(staged.stageRoot, posixPath) : staged.stageRoot,
      yamlTarget: effectiveTarget,
      importHappened: true,
      cleanup: staged.cleanup,
    };
  }

  let discoveryRoot: string;
  if (!hasAbRoot) {
    discoveryRoot = contentRoot;
  } else if (!posixPath) {
    discoveryRoot = repoRoot;
  } else if (effectiveTarget && pathSupportsNativePick(posixPath, effectiveTarget)) {
    discoveryRoot = repoRoot;
  } else {
    discoveryRoot = contentRoot;
  }

  let implicitPick: ExtendPick | undefined;
  let scopedFeatures: string[] | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  if (shouldStageNativeScope && effectiveTarget) {
    const staged = await stageNativeInstallScope(repoRoot, posixPath, effectiveTarget);
    discoveryRoot = staged.stageRoot;
    implicitPick = staged.pick;
    scopedFeatures = staged.features;
    cleanup = staged.cleanup;
  } else if (
    discoveryRoot === repoRoot &&
    posixPath &&
    effectiveTarget &&
    pathSupportsNativePick(posixPath, effectiveTarget)
  ) {
    implicitPick = await inferImplicitPickFromNativePath(repoRoot, posixPath, effectiveTarget);
    if (!extendPickHasArrays(implicitPick)) {
      throw new Error(
        `No installable native resources found under "${posixPath}" for target "${effectiveTarget}". ` +
          `Try --path "${posixPath}" without --target so agentsmesh can auto-detect the layout, ` +
          `or use --as <rules|commands|agents|skills> to install the directory as a flat collection.`,
      );
    }
  }

  let yamlTarget: string | undefined;
  if (explicitTarget) {
    yamlTarget = explicitTarget;
  } else if (
    effectiveTarget &&
    ((implicitPick && extendPickHasArrays(implicitPick)) || (scopedFeatures?.length ?? 0) > 0)
  ) {
    yamlTarget = effectiveTarget;
  }

  return {
    discoveryRoot,
    implicitPick,
    scopedFeatures,
    yamlTarget,
    importHappened: cleanup !== undefined,
    cleanup,
  };
}
