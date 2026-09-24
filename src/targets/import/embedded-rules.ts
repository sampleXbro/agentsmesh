import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { mkdirp, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { extractEmbeddedRules } from '../projection/managed-blocks.js';
import {
  takeEmbeddedRuleEntries,
  type ExtractedEmbeddedRule,
} from '../projection/embedded-rule-entries.js';
import { serializeImportedRuleWithFallback } from './import-metadata.js';

export interface SplitEmbeddedRulesInput {
  content: string;
  projectRoot: string;
  rulesDir: string;
  sourcePath: string;
  fromTool: string;
  normalize: (content: string, sourceFile: string, destinationFile: string) => string;
  /** Extra frontmatter for every restored rule (e.g. the file's Codex instruction variant). */
  frontmatter?: Record<string, unknown>;
}

export interface SplitEmbeddedRulesResult {
  rootContent: string;
  results: ImportResult[];
}

function canonicalRulePath(source: string): string | null {
  const normalized = source.replace(/\\/g, '/');
  if (!normalized.startsWith('rules/') || normalized.endsWith('/')) return null;
  if (!normalized.endsWith('.md')) return null;
  return normalized;
}

export async function splitEmbeddedRulesToCanonical(
  input: SplitEmbeddedRulesInput,
): Promise<SplitEmbeddedRulesResult> {
  const extracted = extractEmbeddedRules(input.content);
  const results = await writeEmbeddedRules(extracted.rules, input);
  return { rootContent: extracted.rootContent, results };
}

async function writeEmbeddedRules(
  rules: readonly ExtractedEmbeddedRule[],
  input: SplitEmbeddedRulesInput,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  if (rules.length === 0) return results;

  await mkdirp(join(input.projectRoot, input.rulesDir));
  for (const rule of rules) {
    const canonicalSource = canonicalRulePath(rule.source);
    if (canonicalSource === null || canonicalSource === 'rules/_root.md') continue;
    const destPath = join(input.projectRoot, '.agentsmesh', canonicalSource);
    const normalized = input.normalize(rule.body, input.sourcePath, destPath);
    const { frontmatter, body } = parseFrontmatter(normalized);
    const content = await serializeImportedRuleWithFallback(
      destPath,
      {
        ...frontmatter,
        ...input.frontmatter,
        root: false,
        description: rule.description || undefined,
        globs: rule.globs.length > 0 ? rule.globs : undefined,
        targets: rule.targets.length > 0 ? rule.targets : undefined,
      },
      body,
    );
    await writeFileAtomic(destPath, content);
    results.push({
      fromTool: input.fromTool,
      fromPath: input.sourcePath,
      toPath: `.agentsmesh/${canonicalSource}`,
      feature: 'rules',
    });
  }
  return results;
}

/**
 * Split a nested `<dir>/AGENTS.md`: its embedded rules go back to their own
 * canonical files (their results are added to `into`), and the text left over
 * is returned as the directory's own rule, or null when there is none (#140).
 */
export async function splitNestedAgentsFile(
  input: SplitEmbeddedRulesInput,
  into: ImportResult[],
): Promise<string | null> {
  const { rest, rules } = takeEmbeddedRuleEntries(input.content);
  into.push(...(await writeEmbeddedRules(rules, input)));
  return rest.length > 0 ? rest : null;
}
