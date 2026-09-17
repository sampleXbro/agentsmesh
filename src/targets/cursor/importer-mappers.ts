import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedCommandWithFallback,
  serializeImportedRuleWithFallback,
} from '../import/import-metadata.js';
import type { ImportFileMapping } from '../import/import-orchestrator.js';
import { toToolsArray } from '../import/shared-import-helpers.js';

export async function mapCursorRuleFile(
  relativePath: string,
  destDir: string,
  normalizeTo: (destinationFile: string) => string,
  onRootRule: () => void,
): Promise<ImportFileMapping> {
  const rawRelativePath = relativePath.replace(/\.mdc$/i, '.md');
  const rawDestPath = join(destDir, rawRelativePath);
  const initial = parseFrontmatter(normalizeTo(rawDestPath));
  const isRoot = initial.frontmatter.alwaysApply === true;
  const destPath = isRoot ? join(destDir, '_root.md') : rawDestPath;
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  if (isRoot) onRootRule();
  const canonicalFm: Record<string, unknown> = { ...frontmatter, root: isRoot };
  delete canonicalFm.alwaysApply;
  if (!isRoot) {
    const trigger = deriveCursorTrigger(frontmatter);
    if (trigger !== null) canonicalFm.trigger = trigger;
  }
  return {
    destPath,
    toPath: `${AB_RULES}/${isRoot ? '_root.md' : rawRelativePath}`,
    feature: 'rules',
    content: await serializeImportedRuleWithFallback(destPath, canonicalFm, body),
  };
}

/**
 * Cursor rule activation modes (https://cursor.com/docs/rules#rule-file-format):
 *   alwaysApply: true                            → always_on
 *   alwaysApply: false + non-empty globs         → glob (auto-attached)
 *   alwaysApply: false + non-empty description   → model_decision (agent-requested)
 *   alwaysApply: false + neither                 → manual (@-mention only)
 *
 * The manual case matters because forwarding a manual
 * Cursor rule into a target that loads every rule unconditionally inverts the
 * activation from "never" to "always". Capturing `trigger: 'manual'` in the
 * canonical lets `lintRuleScopeInversion` warn before generation silently does
 * the wrong thing for non-Cursor targets.
 */
function deriveCursorTrigger(
  frontmatter: Record<string, unknown>,
): 'glob' | 'model_decision' | 'manual' | null {
  if (frontmatter.alwaysApply !== false) return null;
  const globs = Array.isArray(frontmatter.globs) ? frontmatter.globs : [];
  if (globs.length > 0) return 'glob';
  const description = typeof frontmatter.description === 'string' ? frontmatter.description : '';
  if (description.trim().length > 0) return 'model_decision';
  return 'manual';
}

export async function mapCursorCommandFile(
  relativePath: string,
  destDir: string,
  normalizeTo: (destinationFile: string) => string,
): Promise<ImportFileMapping> {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  const fromCamel = toToolsArray(frontmatter.allowedTools);
  const allowedTools =
    fromCamel.length > 0 ? fromCamel : toToolsArray(frontmatter['allowed-tools']);
  return {
    destPath,
    toPath: `${AB_COMMANDS}/${relativePath}`,
    feature: 'commands',
    content: await serializeImportedCommandWithFallback(
      destPath,
      {
        description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
        hasDescription: Object.prototype.hasOwnProperty.call(frontmatter, 'description'),
        allowedTools,
        hasAllowedTools:
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowedTools') ||
          Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools'),
      },
      body,
    ),
  };
}

export async function mapCursorAgentFile(
  relativePath: string,
  destDir: string,
  normalizeTo: (destinationFile: string) => string,
): Promise<ImportFileMapping> {
  const destPath = join(destDir, relativePath);
  const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_AGENTS}/${relativePath}`,
    feature: 'agents',
    content: await serializeImportedAgentWithFallback(destPath, frontmatter, body),
  };
}
