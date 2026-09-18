/**
 * Gemini CLI target importer — GEMINI.md, .gemini/rules, .gemini/commands,
 * .gemini/settings.json → canonical .agentsmesh/.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { splitEmbeddedRulesToCanonical } from '../import/embedded-rules.js';
import { runDescriptorImport } from '../import/descriptor-import-runner.js';
import {
  GEMINI_TARGET,
  GEMINI_ROOT,
  GEMINI_COMPAT_AGENTS,
  GEMINI_COMPAT_INNER_ROOT,
  GEMINI_SYSTEM,
} from './constants.js';
import { descriptor } from './index.js';
import { importGeminiSettings, importGeminiIgnore } from './format-helpers.js';
import { importGeminiPolicies } from './policies-importer.js';
import { stripProjectRootCanonicalPrefix } from './importer-strip.js';
import { importGeminiSkillsAndAgents } from './importer-skills-agents.js';

/**
 * Import Gemini config into canonical .agentsmesh/.
 *
 * @param projectRoot - Project root directory
 * @returns Import results for each imported file
 */
/**
 * Gemini's root rule has the most baroque pre-processing of any target:
 *  - 4-way fallback chain (compat AGENTS.md, compat inner, GEMINI.md, system)
 *  - codex-normalize for the compat sources
 *  - embedded-rule splitter
 *  - cross-target prefix substitution + project-root canonical-prefix stripping
 * Stays imperative — none of this is declarable through the runner.
 */
async function importRootRule(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const normalizeCodex = await createImportReferenceNormalizer('codex-cli', projectRoot);
  const rulesDir = join(projectRoot, AB_RULES);
  const compatAgentsRootPath = join(projectRoot, GEMINI_COMPAT_AGENTS);
  const compatInnerRootPath = join(projectRoot, GEMINI_COMPAT_INNER_ROOT);
  const candidates = [
    compatAgentsRootPath,
    compatInnerRootPath,
    join(projectRoot, GEMINI_ROOT),
    join(projectRoot, GEMINI_SYSTEM),
  ];
  let rootContent: string | null = null;
  let rootSourcePath: string = candidates[candidates.length - 1]!;
  for (const candidate of candidates) {
    const content = await readFileSafe(candidate);
    if (content !== null) {
      rootContent = content;
      rootSourcePath = candidate;
      break;
    }
  }
  if (rootContent === null) return;

  await mkdirp(rulesDir);
  const destPath = join(rulesDir, '_root.md');
  const compatContent =
    rootSourcePath === compatAgentsRootPath || rootSourcePath === compatInnerRootPath
      ? normalizeCodex(rootContent, rootSourcePath, destPath)
      : rootContent;
  const split = await splitEmbeddedRulesToCanonical({
    content: compatContent,
    projectRoot,
    rulesDir: AB_RULES,
    sourcePath: rootSourcePath,
    fromTool: GEMINI_TARGET,
    normalize,
  });
  results.push(...split.results);
  const compatNormalized = normalize(split.rootContent, rootSourcePath, destPath);
  const normalizedRoot = stripProjectRootCanonicalPrefix(
    compatNormalized
      .replace(/\.agents\/skills\//g, '.agentsmesh/skills/')
      .replace(/\.agents\\skills\\/g, '.agentsmesh/skills/'),
    projectRoot,
  );
  const { frontmatter, body } = parseFrontmatter(normalizedRoot);
  const hasRoot = frontmatter.root === true;
  const outFm = hasRoot ? frontmatter : { ...frontmatter, root: true };
  const outContent = stripProjectRootCanonicalPrefix(
    await serializeImportedRuleWithFallback(destPath, outFm, body),
    projectRoot,
  );
  await writeFileAtomic(destPath, outContent);
  results.push({
    fromTool: GEMINI_TARGET,
    fromPath: rootSourcePath,
    toPath: `${AB_RULES}/_root.md`,
    feature: 'rules',
  });
}

export async function importFromGemini(projectRoot: string): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(GEMINI_TARGET, projectRoot);
  await importRootRule(projectRoot, results, normalize);
  results.push(...(await runDescriptorImport(descriptor, projectRoot, 'project', { normalize })));
  await importGeminiSkillsAndAgents(projectRoot, results, normalize);
  await importGeminiSettings(projectRoot, results);
  await importGeminiIgnore(projectRoot, results);
  results.push(...(await importGeminiPolicies(projectRoot)));
  return results;
}
