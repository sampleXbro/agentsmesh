import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { splitFrontmatter } from '../../utils/text/markdown.js';

/**
 * Split a canonical markdown file with the same delimiter rules the canonical
 * loaders use, so MCP reads and `generate` agree on where frontmatter ends.
 */
export function parseMd(src: string): { frontmatter: Record<string, unknown>; body: string } {
  const split = splitFrontmatter(src);
  if (split === null) return { frontmatter: {}, body: src };
  return {
    frontmatter: (parseYaml(split.yaml) ?? {}) as Record<string, unknown>,
    // Drop the closer's newline and the one blank line serializeMd adds.
    body: src.slice(split.prefix.length).replace(/^\r?\n(?:\r?\n)?/, ''),
  };
}

export function serializeMd(frontmatter: Record<string, unknown>, body: string): string {
  if (Object.keys(frontmatter).length === 0) {
    // An empty block keeps a body that starts with `---` as body text (#135).
    return splitFrontmatter(body) === null ? body : `---\n---\n\n${body}`;
  }
  const yaml = stringifyYaml(frontmatter).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}
