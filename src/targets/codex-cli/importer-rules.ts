import { AB_RULES } from '../../core/canonical-paths.js';
import { basename, dirname, join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedRuleWithFallback } from '../import/import-metadata.js';
import { splitEmbeddedRulesToCanonical, splitNestedAgentsFile } from '../import/embedded-rules.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import {
  shouldImportScopedAgentsRule,
  removePathIfExists,
} from '../import/scoped-agents-import.js';
import {
  CODEX_TARGET,
  CODEX_MD,
  AGENTS_MD,
  CODEX_GLOBAL_AGENTS_MD,
  CODEX_GLOBAL_AGENTS_OVERRIDE_MD,
  CODEX_INSTRUCTIONS_DIR,
} from './constants.js';
import { importCodexNonRootRuleFiles } from './import-codex-non-root-rules.js';
import { stripCodexRuleIndex } from './instruction-mirror.js';

export async function importCodexRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  normalizeWindsurf: (content: string, sourceFile: string, destinationFile: string) => string,
  layoutScope: TargetLayoutScope,
): Promise<void> {
  const codexPath = join(projectRoot, CODEX_MD);
  const agentsPath = join(projectRoot, AGENTS_MD);
  const globalOverridePath = join(projectRoot, CODEX_GLOBAL_AGENTS_OVERRIDE_MD);
  const globalAgentsPath = join(projectRoot, CODEX_GLOBAL_AGENTS_MD);

  const globalOverrideContent =
    layoutScope === 'global' ? await readFileSafe(globalOverridePath) : null;
  const globalAgentsContent =
    layoutScope === 'global' ? await readFileSafe(globalAgentsPath) : null;
  const agentsContent = layoutScope === 'project' ? await readFileSafe(agentsPath) : null;
  const codexContent = layoutScope === 'project' ? await readFileSafe(codexPath) : null;

  const sourcePath =
    globalOverrideContent !== null
      ? globalOverridePath
      : globalAgentsContent !== null
        ? globalAgentsPath
        : agentsContent !== null
          ? agentsPath
          : codexPath;
  const destDir = join(projectRoot, AB_RULES);
  const content = globalOverrideContent ?? globalAgentsContent ?? agentsContent ?? codexContent;
  if (content !== null) {
    await mkdirp(destDir);
    const destPath = join(destDir, '_root.md');
    const stripped =
      sourcePath === agentsPath ||
      sourcePath === globalAgentsPath ||
      sourcePath === globalOverridePath
        ? stripCodexRuleIndex(content)
        : content;
    const split = await splitEmbeddedRulesToCanonical({
      content: stripped,
      projectRoot,
      rulesDir: AB_RULES,
      sourcePath,
      fromTool: 'codex-cli',
      normalize,
    });
    results.push(...split.results);
    const normalizedContent =
      sourcePath === agentsPath ||
      sourcePath === globalAgentsPath ||
      sourcePath === globalOverridePath
        ? normalize(
            normalizeWindsurf(split.rootContent, sourcePath, destPath),
            sourcePath,
            destPath,
          )
        : normalize(split.rootContent, sourcePath, destPath);
    const { frontmatter, body } = parseFrontmatter(normalizedContent);
    const outFm = frontmatter.root === true ? frontmatter : { ...frontmatter, root: true };
    const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
    await writeFileAtomic(destPath, outContent);

    results.push({
      fromTool: 'codex-cli',
      fromPath: sourcePath,
      toPath: `${AB_RULES}/_root.md`,
      feature: 'rules',
    });
  }

  await importInstructionMirrors(projectRoot, destDir, results, normalize);
  results.push(...(await importCodexNonRootRuleFiles(projectRoot, destDir, normalize)));

  if (layoutScope !== 'global') {
    const embedded: ImportResult[] = [];
    results.push(
      ...(await importFileDirectory({
        srcDir: projectRoot,
        destDir,
        extensions: ['AGENTS.md', 'AGENTS.override.md'],
        fromTool: 'codex-cli',
        normalize,
        mapEntry: async ({ srcPath, content, normalizeTo }) => {
          const relDir = relative(projectRoot, dirname(srcPath)).replace(/\\/g, '/');
          const fileName = basename(srcPath);
          const isOverride = fileName === 'AGENTS.override.md';
          if (!relDir || relDir === '.') return null;
          if (!isOverride && fileName !== 'AGENTS.md') return null;
          const ruleName = relDir.replace(/\//g, '-');
          if (!shouldImportScopedAgentsRule(relDir)) {
            await removePathIfExists(join(destDir, `${ruleName}.md`));
            return null;
          }
          const variant = isOverride ? { codex_instruction: 'override' } : {};
          const ownText = await splitNestedAgentsFile(
            {
              content,
              projectRoot,
              rulesDir: AB_RULES,
              sourcePath: srcPath,
              fromTool: 'codex-cli',
              normalize,
              frontmatter: variant,
            },
            embedded,
          );
          if (ownText === null) return null;
          const destPath = join(destDir, `${ruleName}.md`);
          const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath, ownText));
          return {
            destPath,
            toPath: `${AB_RULES}/${ruleName}.md`,
            feature: 'rules',
            content: await serializeImportedRuleWithFallback(
              destPath,
              { ...frontmatter, root: false, globs: [`${relDir}/**`], ...variant },
              body,
            ),
          };
        },
      })),
    );
    results.push(...embedded);
  }
}

async function importInstructionMirrors(
  projectRoot: string,
  destDir: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  try {
    const files = await readDirRecursiveNoSymlinks(join(projectRoot, CODEX_INSTRUCTIONS_DIR));
    const instructionFiles = files.filter((file) => file.endsWith('.md'));
    const instructionsRoot = join(projectRoot, CODEX_INSTRUCTIONS_DIR);
    for (const srcPath of instructionFiles) {
      const relativePath = relative(instructionsRoot, srcPath).replace(/\\/g, '/');
      if (relativePath === '_root.md') continue;
      const content = await readFileSafe(srcPath);
      if (!content) continue;
      const destPath = join(destDir, relativePath);
      const { frontmatter, body } = parseFrontmatter(normalize(content, srcPath, destPath));
      await mkdirp(destDir);
      const outFm = frontmatter.root === true ? frontmatter : { ...frontmatter, root: false };
      const outContent = await serializeImportedRuleWithFallback(destPath, outFm, body);
      await writeFileAtomic(destPath, outContent);
      results.push({
        fromTool: CODEX_TARGET,
        fromPath: srcPath,
        toPath: `${AB_RULES}/${relativePath}`,
        feature: 'rules',
      });
    }
  } catch {
    /* CODEX_INSTRUCTIONS_DIR may not exist */
  }
}
