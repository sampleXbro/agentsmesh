/**
 * Windsurf target importer — .windsurfrules, .windsurf/rules/*.md, .windsurfignore → canonical.
 *
 * Kept fully imperative. The root rule is plain-text (no frontmatter) with a
 * codex-normalized AGENTS.md fallback; nested AGENTS.md files are scoped
 * scanned with prune-on-disable behavior (`removePathIfExists`); ignore parsing
 * strips comments + falls back from `.windsurfignore` to `.codeiumignore`;
 * workflows / skills / hooks / mcp use Windsurf-specific parsers. None of
 * these patterns are expressible through the descriptor runner's modes.
 */

import { AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { importWindsurfNestedAgents } from './import-nested-agents.js';
import {
  WINDSURF_TARGET,
  WINDSURF_RULES_ROOT,
  WINDSURF_RULES_DIR,
  WINDSURF_IGNORE,
  CODEIUM_IGNORE,
  WINDSURF_AGENTS_MD,
} from './constants.js';
import { importWorkflows } from './importer-workflows.js';
import { importSkills } from './skills-adapter.js';
import { importWindsurfHooks } from './importer-hooks.js';
import { importWindsurfMcp } from './importer-mcp.js';

/**
 * Import Windsurf config into canonical .agentsmesh/.
 * Sources: .windsurfrules (root), .windsurf/rules/*.md (rules), .windsurfignore (ignore).
 *
 * @param projectRoot - Project root directory (repo root, or user home for global scope)
 * @param options - When `scope` is `global`, skips recursive nested `AGENTS.md` discovery under `projectRoot`.
 * @returns Import results for each imported file
 */
export async function importFromWindsurf(
  projectRoot: string,
  options?: { scope?: TargetLayoutScope },
): Promise<ImportResult[]> {
  const layoutScope: TargetLayoutScope = options?.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(WINDSURF_TARGET, projectRoot);
  const normalizeCodex = await createImportReferenceNormalizer('codex-cli', projectRoot);
  const destRulesDir = join(projectRoot, AB_RULES);

  const rootPath = join(projectRoot, WINDSURF_RULES_ROOT);
  const rootContent = await readFileSafe(rootPath);
  if (rootContent !== null) {
    await mkdirp(destRulesDir);
    const destPath = join(destRulesDir, '_root.md');
    const body = normalize(rootContent, rootPath, destPath).trim();
    const outContent = await serializeImportedRuleWithFallback(destPath, { root: true }, body);
    await writeFileAtomic(destPath, outContent);
    results.push({
      fromTool: 'windsurf',
      fromPath: rootPath,
      toPath: `${AB_RULES}/_root.md`,
      feature: 'rules',
    });
  }

  // Fallback: AGENTS.md when .windsurfrules absent
  if (rootContent === null) {
    const agentsMdPath = join(projectRoot, WINDSURF_AGENTS_MD);
    const agentsMdContent = await readFileSafe(agentsMdPath);
    if (agentsMdContent !== null) {
      await mkdirp(destRulesDir);
      const destPath = join(destRulesDir, '_root.md');
      const body = normalize(
        normalizeCodex(agentsMdContent, agentsMdPath, destPath),
        agentsMdPath,
        destPath,
      ).trim();
      const outContent = await serializeImportedRuleWithFallback(destPath, { root: true }, body);
      await writeFileAtomic(destPath, outContent);
      results.push({
        fromTool: 'windsurf',
        fromPath: agentsMdPath,
        toPath: `${AB_RULES}/_root.md`,
        feature: 'rules',
      });
    }
  }

  if (layoutScope !== 'global') {
    results.push(...(await importWindsurfNestedAgents(projectRoot, normalize)));
  }

  const rulesDir = join(projectRoot, WINDSURF_RULES_DIR);
  results.push(
    ...(await importFileDirectory({
      srcDir: rulesDir,
      destDir: destRulesDir,
      extensions: ['.md'],
      fromTool: 'windsurf',
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        if (relativePath === '_root.md' && rootContent !== null) return null;
        const destPath = join(destRulesDir, relativePath);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        const normalizedFrontmatter: Record<string, unknown> = { ...frontmatter };
        if (typeof normalizedFrontmatter.glob === 'string' && normalizedFrontmatter.glob.trim()) {
          normalizedFrontmatter.globs = [normalizedFrontmatter.glob];
          delete normalizedFrontmatter.glob;
        }
        return {
          destPath,
          toPath: `${AB_RULES}/${relativePath}`,
          feature: 'rules',
          content: await serializeImportedRuleWithFallback(
            destPath,
            { ...normalizedFrontmatter, root: false },
            body,
          ),
        };
      },
    })),
  );

  let ignorePath = join(projectRoot, WINDSURF_IGNORE);
  let ignoreContent = await readFileSafe(ignorePath);
  if (ignoreContent === null || !ignoreContent.trim()) {
    ignorePath = join(projectRoot, CODEIUM_IGNORE);
    ignoreContent = await readFileSafe(ignorePath);
  }
  if (ignoreContent !== null && ignoreContent.trim()) {
    const lines = ignoreContent.split(/\r?\n/);
    const patterns: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && !t.startsWith('#')) patterns.push(t);
    }
    if (patterns.length > 0) {
      await mkdirp(join(projectRoot, '.agentsmesh'));
      const destIgnorePath = join(projectRoot, AB_IGNORE);
      await writeFileAtomic(destIgnorePath, patterns.join('\n'));
      results.push({
        fromTool: 'windsurf',
        fromPath: ignorePath,
        toPath: AB_IGNORE,
        feature: 'ignore',
      });
    }
  }

  await importWorkflows(projectRoot, results, normalize);
  await importSkills(projectRoot, results, normalize);
  await importWindsurfHooks(projectRoot, results);
  await importWindsurfMcp(projectRoot, results);

  return results;
}
