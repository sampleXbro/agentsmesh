/**
 * Deep Agents CLI native subagent format.
 *
 * Subagents are a dedicated on-disk surface (docs.langchain.com/oss/javascript/
 * deepagents/code/configuration#data-locations): `.deepagents/agents/{name}/AGENTS.md`
 * (project) or `~/.deepagents/{agent}/agents/{name}/AGENTS.md` (global). Each
 * subagent is "an AGENTS.md file with YAML frontmatter (name, description,
 * optional model) and a markdown body for the system prompt" — distinct from
 * skills (SKILL.md) and from the Claude-Code-style rich agent frontmatter
 * (tools/permissionMode/maxTurns/…) used by other targets.
 *
 * Import is directory-based like skills, but the canonical *name* comes from
 * the subagent's own frontmatter `name` (falling back to the parent directory
 * name), then written flat to `.agentsmesh/agents/{name}.md` — not nested.
 */

import { AB_AGENTS } from '../../core/canonical-paths.js';
import { basename, dirname, join } from 'node:path';
import type { CanonicalAgent } from '../../core/types.js';
import { parseFrontmatter, serializeFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedAgentWithFallback } from '../import/import-metadata.js';
import type { ImportEntryMapper, ImportEntryMapping } from '../catalog/import-descriptor.js';

export function serializeDeepagentsAgent(agent: CanonicalAgent): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description || undefined,
    model: agent.model || undefined,
  };
  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }
  return serializeFrontmatter(frontmatter, agent.body.trim() || '');
}

/**
 * Import mapper for `{agentsDir}/{name}/AGENTS.md` entries. Derives the
 * canonical name from the frontmatter `name` (required per the docs), falling
 * back to the parent directory name for malformed/hand-authored files.
 */
export const deepagentsCliAgentMapper: ImportEntryMapper = async (
  ctx,
): Promise<ImportEntryMapping | null> => {
  const preParsed = parseFrontmatter(ctx.content);
  const rawDirName = basename(dirname(ctx.relativePath));
  const dirName = rawDirName === '.' ? '' : rawDirName;
  const name =
    typeof preParsed.frontmatter.name === 'string' && preParsed.frontmatter.name.trim()
      ? preParsed.frontmatter.name.trim()
      : dirName;
  if (!name) return null;

  const destPath = join(ctx.destDir, `${name}.md`);
  const { frontmatter, body } = parseFrontmatter(ctx.normalizeTo(destPath));
  return {
    destPath,
    toPath: `${AB_AGENTS}/${name}.md`,
    content: await serializeImportedAgentWithFallback(destPath, frontmatter, body),
  };
};
