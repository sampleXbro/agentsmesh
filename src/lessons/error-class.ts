/**
 * Coarse error-class signature for the recurrence-driven capture nudge (STORE).
 *
 * A raw tool error is volatile — paths, line/column numbers, hashes and hex
 * addresses differ run to run — so we reduce it to a stable-ish CLASS: one line,
 * lowercased, with those volatile spans collapsed to a placeholder and the
 * length capped. Deliberately coarse: an honest weak signature surfaced to remind
 * the author WHAT recurred so they write a precise rule — never an identity key.
 *
 * A shell failure starts with an `Exit code N` line, so classing that line
 * would put every Bash failure in one class; the line after it is used instead.
 */

const MAX_ERROR_CLASS = 120;
const EXIT_CODE_LINE = /^exit code -?\d+$/i;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/** Has a letter, and is not a package-manager script banner (`> pkg@1.0 test`). */
function isMeaningful(line: string): boolean {
  return /[a-z]/i.test(line) && !line.startsWith('> ');
}

function classLine(text: string): string | undefined {
  const lines = text
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const first = lines[0];
  if (first === undefined || !EXIT_CODE_LINE.test(first)) return first;
  return lines.slice(1).find(isMeaningful) ?? first;
}

export function errorClass(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const line = classLine(text);
  if (line === undefined) return undefined;
  const normalized = line
    .toLowerCase()
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '…') // quoted paths / values (balanced delimiters)
    .replace(/\S*[\\/]\S*/g, '…') // unquoted paths and URLs
    .replace(/0x[0-9a-f]+/g, '…') // hex addresses
    .replace(/\b[0-9a-f]{7,}\b/g, (run) => (/\d/.test(run) ? '…' : run)) // hashes, ids
    .replace(/\d+/g, '…') // line/col numbers, counts
    .replace(/…+/g, '…') // collapse adjacent placeholders
    .replace(/\s+/g, ' ')
    .trim();
  const out = normalized.length > 0 ? normalized : line.toLowerCase();
  return out.slice(0, MAX_ERROR_CLASS);
}
