import { parse as parseToml } from 'smol-toml';
import { parseFrontmatter } from '../../utils/text/markdown.js';

export function parseFlexibleFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const yamlOpen = content.indexOf('---');
  const tomlOpen = content.indexOf('+++');
  if (yamlOpen === 0 && (tomlOpen === -1 || yamlOpen <= tomlOpen)) {
    return parseFrontmatter(content);
  }
  if (tomlOpen === 0) {
    const tomlClose = content.indexOf('+++', 3);
    if (tomlClose !== -1) {
      try {
        const tomlStr = content.slice(3, tomlClose).trim();
        const body = content.slice(tomlClose + 3).trim();
        const parsed = tomlStr === '' ? {} : (parseToml(tomlStr) ?? {});
        const frontmatter = parsed as Record<string, unknown>;
        return { frontmatter, body };
      } catch {
        return { frontmatter: {}, body: content.trim() };
      }
    }
  }
  return { frontmatter: {}, body: content.trim() };
}
