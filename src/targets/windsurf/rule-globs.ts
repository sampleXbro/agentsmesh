/**
 * Windsurf scopes a `trigger: glob` rule with `globs:`: a string holding one
 * pattern or several joined by commas (docs.devin.ai/desktop/cascade/memories).
 * A singular `glob:` is not read. Import still accepts `glob:` (older
 * agentsmesh output) and a YAML list, which some real rules use.
 */

import { toToolsArray } from '../import/shared-import-helpers.js';

/** Split on commas outside `{…}`, so a brace pattern like `*.{ts,tsx}` stays whole. */
function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '{') depth++;
    else if (char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function parseWindsurfGlobs(value: unknown): string[] {
  if (typeof value === 'string') return splitTopLevelCommas(value);
  return Array.isArray(value) ? toToolsArray(value) : [];
}

const UNQUOTED_GLOBS_LINE = /^(\s*globs?\s*:[ \t]*)([^\s"'[{|>#][^\r\n]*?)[ \t]*(\r?)$/;

/**
 * Quote an unquoted `globs:`/`glob:` value inside the leading frontmatter.
 * Windsurf's own docs example writes the pattern bare, starting with `**`,
 * which is not valid YAML (a value starting with `*` is an alias) and aborted
 * the whole import.
 */
export function quoteWindsurfGlobValues(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') break;
    const match = UNQUOTED_GLOBS_LINE.exec(lines[i]!);
    if (match !== null) lines[i] = `${match[1]}${JSON.stringify(match[2])}${match[3]}`;
  }
  return lines.join('\n');
}
