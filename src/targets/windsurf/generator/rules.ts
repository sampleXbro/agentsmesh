import { basename } from 'node:path';
import type { CanonicalFiles } from '../../../core/types.js';
import { serializeFrontmatter } from '../../../utils/text/markdown.js';
import { appendEmbeddedRulesBlock } from '../../projection/managed-blocks.js';
import { WINDSURF_RULES_DIR, WINDSURF_AGENTS_MD } from '../constants.js';
import type { RulesOutput } from './types.js';

function ruleSlug(source: string): string {
  const name = basename(source, '.md');
  return name === '_root' ? 'root' : name;
}

export function generateRules(canonical: CanonicalFiles): RulesOutput[] {
  const outputs: RulesOutput[] = [];
  const root = canonical.rules.find((r) => r.root);
  if (!root) return [];

  outputs.push({
    path: WINDSURF_AGENTS_MD,
    content: root.body.trim(),
  });

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('windsurf')) continue;
    const slug = ruleSlug(rule.source);
    const normalizedTrigger = rule.trigger || (rule.globs.length > 0 ? 'glob' : undefined);
    const frontmatter: Record<string, unknown> = {
      description: rule.description || undefined,
      trigger: normalizedTrigger,
      // Windsurf reads `globs` as one comma-joined string; it ignores `glob`.
      globs: rule.globs.length > 0 ? rule.globs.join(',') : undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content =
      Object.keys(frontmatter).length > 0
        ? serializeFrontmatter(frontmatter, rule.body.trim() || '')
        : rule.body.trim() || '';
    // Written once: Windsurf applies a `trigger: glob` rule to the files its
    // globs match, and also reads a `<dir>/AGENTS.md` as a rule for that folder,
    // so a nested copy loaded the text twice and widened its scope.
    outputs.push({ path: `${WINDSURF_RULES_DIR}/${slug}.md`, content });
  }

  return outputs;
}

export function renderWindsurfGlobalInstructions(canonical: CanonicalFiles): string {
  const root = canonical.rules.find((r) => r.root);
  const nonRootRules = canonical.rules.filter((r) => {
    if (r.root) return false;
    return r.targets.length === 0 || r.targets.includes('windsurf');
  });

  return appendEmbeddedRulesBlock(root?.body.trim() ?? '', nonRootRules);
}
