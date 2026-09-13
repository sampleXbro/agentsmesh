/**
 * Strip single-line (//) and block JS-style comments from a JSONC string
 * while preserving string literal contents (e.g. URLs containing "//").
 */
export function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    // Inside a JSON string literal — copy verbatim until closing quote
    if (ch === '"') {
      result += ch;
      i++;
      while (i < len) {
        const sc = text[i];
        result += sc;
        if (sc === '\\') {
          // Escaped character — copy next char too
          i++;
          if (i < len) {
            result += text[i];
          }
        } else if (sc === '"') {
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    // Block comment /* ... */
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < len) {
        if (text[i] === '*' && text[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    // Single-line comment // ...
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < len && text[i] !== '\n') {
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}
