import { AB_HOOKS, AB_ROOT_RULE, AB_RULES } from '../../core/canonical-paths.js';
import { basename, join } from 'node:path';
import type { Hooks, ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { toGlobsArray } from '../import/shared-import-helpers.js';
import {
  mkdirp,
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { parseKiroHookFile, serializeCanonicalHooks } from './hook-format.js';
import { importKiroAgentPermissions, importKiroGlobalPermissions } from './permissions-import.js';
import {
  KIRO_TARGET,
  KIRO_AGENTS_MD,
  KIRO_GLOBAL_STEERING_AGENTS_MD,
  KIRO_HOOKS_DIR,
  KIRO_STEERING_DIR,
  KIRO_SKILLS_DIR,
} from './constants.js';
import { descriptor } from './index.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

function canonicalRuleMeta(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const inclusion = typeof frontmatter.inclusion === 'string' ? frontmatter.inclusion : '';
  const meta: Record<string, unknown> = {
    root: false,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: toGlobsArray(frontmatter.fileMatchPattern),
  };
  if (inclusion === 'manual') meta.trigger = 'manual';
  if (inclusion === 'auto') meta.trigger = 'model_decision';
  if (inclusion === 'fileMatch') meta.trigger = 'glob';
  return meta;
}

/** Root rule prefers the active scope's AGENTS.md, then falls back to the other scope. */
async function importRoot(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const candidates =
    scope === 'global'
      ? [KIRO_GLOBAL_STEERING_AGENTS_MD, KIRO_AGENTS_MD]
      : [KIRO_AGENTS_MD, KIRO_GLOBAL_STEERING_AGENTS_MD];
  for (const rel of candidates) {
    const srcPath = join(projectRoot, rel);
    const content = await readFileSafe(srcPath);
    if (content === null) continue;
    const destPath = join(projectRoot, AB_ROOT_RULE);
    const { frontmatter, body } = parseFrontmatter(normalize(content, srcPath, destPath));
    await writeFileAtomic(
      destPath,
      await serializeImportedRuleWithFallback(destPath, { ...frontmatter, root: true }, body),
    );
    results.push({
      fromTool: KIRO_TARGET,
      fromPath: srcPath,
      toPath: AB_ROOT_RULE,
      feature: 'rules',
    });
    return;
  }
}

/** Steering rules carry Kiro-specific `inclusion`/`fileMatchPattern` keys, and must skip the AGENTS.md root entry. */
async function importNonRootRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
): Promise<void> {
  const destDir = join(projectRoot, AB_RULES);
  results.push(
    ...(await importFileDirectory({
      srcDir: join(projectRoot, KIRO_STEERING_DIR),
      destDir,
      extensions: ['.md'],
      fromTool: KIRO_TARGET,
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        if (basename(relativePath) === 'AGENTS.md') return null;
        const destPath = join(destDir, relativePath);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        return {
          destPath,
          toPath: `${AB_RULES}/${relativePath}`,
          feature: 'rules',
          content: await serializeImportedRuleWithFallback(
            destPath,
            canonicalRuleMeta(frontmatter),
            body,
          ),
        };
      },
    })),
  );
}

/** Kiro hooks live in `.json` files with a custom JSON schema; not declarable through the runner. */
async function importHooks(projectRoot: string, results: ImportResult[]): Promise<void> {
  const hooks: Hooks = {};
  for (const absPath of await readDirRecursiveNoSymlinks(join(projectRoot, KIRO_HOOKS_DIR))) {
    if (!absPath.endsWith('.json')) continue;
    const parsed = parseKiroHookFile((await readFileSafe(absPath)) ?? '');
    if (!parsed) continue;
    hooks[parsed.event] ??= [];
    hooks[parsed.event]!.push(parsed.entry);
  }
  if (Object.keys(hooks).length === 0) return;
  const destPath = join(projectRoot, AB_HOOKS);
  await mkdirp(join(projectRoot, '.agentsmesh'));
  await writeFileAtomic(destPath, serializeCanonicalHooks(hooks));
  results.push({
    fromTool: KIRO_TARGET,
    fromPath: join(projectRoot, KIRO_HOOKS_DIR),
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}

export async function importFromKiro(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(KIRO_TARGET, projectRoot, scope);
  await importRoot(projectRoot, results, normalize, scope);
  await importNonRootRules(projectRoot, results, normalize);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, scope, { normalize })));
  await importEmbeddedSkills(projectRoot, KIRO_SKILLS_DIR, KIRO_TARGET, results, normalize);
  if (scope === 'global') await importKiroGlobalPermissions(projectRoot, results);
  else await importKiroAgentPermissions(projectRoot, results);
  if (scope === 'project') await importHooks(projectRoot, results);
  return results;
}
