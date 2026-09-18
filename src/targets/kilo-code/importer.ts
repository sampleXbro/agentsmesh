/**
 * Import Kilo Code config into canonical `.agentsmesh/`.
 *
 * Reads BOTH layouts so legacy users round-trip cleanly:
 *   - new   (`.kilo/...` + `AGENTS.md`) — declared in the descriptor.importer.
 *   - legacy (`.kilocode/...` + `.kilocodemodes`) — read by an imperative pass
 *     because the descriptor importer only supports one source per feature in
 *     the directory mode (see lessons L190 — `flatFile` cannot merge multiple
 *     sources, and `directory` mode would dedupe-collide on slug).
 *
 * Skill discovery walks both `.kilo/skills/` and `.kilocode/skills/`.
 */

import { AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import { exists as pathExists } from '../../utils/filesystem/fs.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { kiloNonRootRuleMapper, kiloCommandMapper } from './import-mappers.js';
import { importGlobalKiloMcp } from './global-mcp-import.js';
import { importLegacyModes } from './legacy-modes-import.js';
import {
  KILO_CODE_TARGET,
  KILO_CODE_SKILLS_DIR,
  KILO_CODE_LEGACY_RULES_DIR,
  KILO_CODE_LEGACY_WORKFLOWS_DIR,
  KILO_CODE_LEGACY_SKILLS_DIR,
} from './constants.js';
import { descriptor } from './index.js';

type Normalizer = (content: string, sourceFile: string, destinationFile: string) => string;
const CANONICAL_ROOT_RULE_PATH = `${AB_RULES}/_root.md`;
const LEGACY_ROOT_RULE_FILE = '00-root.md';

/**
 * Walk `.kilocode/rules/*.md` and import as canonical rules. Reuses the same
 * non-root mapper as the new layout so behavior is identical.
 */
async function importLegacyRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalizer,
): Promise<void> {
  const srcDir = join(projectRoot, KILO_CODE_LEGACY_RULES_DIR);
  if (!(await pathExists(srcDir))) return;
  const destDir = join(projectRoot, AB_RULES);
  const rootSourceFile = join(srcDir, LEGACY_ROOT_RULE_FILE);
  const hasCurrentRoot = results.some((result) => result.toPath === CANONICAL_ROOT_RULE_PATH);
  const rootContent = hasCurrentRoot ? null : await readFileSafe(rootSourceFile);

  if (rootContent !== null) {
    const destPath = join(projectRoot, CANONICAL_ROOT_RULE_PATH);
    const normalized = normalize(rootContent, rootSourceFile, destPath);
    const { body } = parseFrontmatter(normalized);
    const serialized = await serializeImportedRuleWithFallback(destPath, { root: true }, body);
    await writeFileAtomic(destPath, serialized);
    results.push({
      feature: 'rules',
      fromTool: KILO_CODE_TARGET,
      fromPath: `${KILO_CODE_LEGACY_RULES_DIR}/${LEGACY_ROOT_RULE_FILE}`,
      toPath: CANONICAL_ROOT_RULE_PATH,
    });
  }

  results.push(
    ...(await importFileDirectory({
      srcDir,
      destDir,
      extensions: ['.md'],
      fromTool: KILO_CODE_TARGET,
      normalize,
      mapEntry: async ({ srcPath, relativePath, content, normalizeTo }) => {
        const mapping = await kiloNonRootRuleMapper({
          absolutePath: srcPath,
          relativePath,
          content,
          destDir,
          normalizeTo,
        });
        if (relativePath === LEGACY_ROOT_RULE_FILE) return null;
        if (!mapping) return null;
        return { ...mapping, feature: 'rules' };
      },
    })),
  );
}

/**
 * Walk `.kilocode/workflows/*.md` (legacy command directory) and import as
 * canonical commands.
 */
async function importLegacyWorkflows(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalizer,
): Promise<void> {
  const srcDir = join(projectRoot, KILO_CODE_LEGACY_WORKFLOWS_DIR);
  if (!(await pathExists(srcDir))) return;
  const destDir = join(projectRoot, AB_COMMANDS);
  results.push(
    ...(await importFileDirectory({
      srcDir,
      destDir,
      extensions: ['.md'],
      fromTool: KILO_CODE_TARGET,
      normalize,
      mapEntry: async ({ srcPath, relativePath, content, normalizeTo }) => {
        const mapping = await kiloCommandMapper({
          absolutePath: srcPath,
          relativePath,
          content,
          destDir,
          normalizeTo,
        });
        if (!mapping) return null;
        return { ...mapping, feature: 'commands' };
      },
    })),
  );
}

export async function importFromKiloCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  // New-layout skills (.kilo/skills/) — covered first.
  await importEmbeddedSkills(
    projectRoot,
    KILO_CODE_SKILLS_DIR,
    KILO_CODE_TARGET,
    results,
    normalize,
  );

  // Project-only legacy passes — `.kilocode/` paths only exist in project scope.
  if (scope === 'project') {
    await importLegacyRules(projectRoot, results, normalize);
    await importLegacyWorkflows(projectRoot, results, normalize);
    await importLegacyModes(projectRoot, results, normalize);
    await importEmbeddedSkills(
      projectRoot,
      KILO_CODE_LEGACY_SKILLS_DIR,
      KILO_CODE_TARGET,
      results,
      normalize,
    );
  }

  // Global-only: MCP servers are a key inside the shared kilo.jsonc rather
  // than a standalone mcpJson file (see global-mcp-import.ts).
  if (scope === 'global') {
    await importGlobalKiloMcp(projectRoot, results);
  }

  return results;
}
