import type { CompatibilityRow, SupportLevel } from '../types.js';
import { LEVEL_SYMBOL, coloredSymbol } from './data.js';
import { colorEnabled } from '../../utils/output/color.js';

const COLORS = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

/** Full display label per feature, keyed by the base name (count suffix stripped). */
const FEATURE_LABEL: Record<string, string> = {
  rules: 'Rules',
  'additional rules': 'Additional Rules',
  commands: 'Commands',
  agents: 'Agents',
  skills: 'Skills',
  mcp: 'MCP',
  hooks: 'Hooks',
  ignore: 'Ignore',
  permissions: 'Permissions',
};

/** Drop a trailing count parenthetical — "commands (9)" / "mcp (3 servers)" → base. */
function baseName(feature: string): string {
  return feature.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function featureLabel(feature: string): string {
  const base = baseName(feature);
  return FEATURE_LABEL[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
}

/** Center plain `text` (visible length === text.length) within `width`. */
function center(text: string, width: number): string {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

/**
 * Transposed compatibility matrix rendered as a bordered box table: one row per
 * target, one full-name column per feature, with a separator rule under the
 * header and every row. Color is gated by `colorEnabled()`.
 */
export function formatMatrix(rows: CompatibilityRow[], targets: string[]): string {
  const useColor = colorEnabled();
  const c = (code: string, text: string): string =>
    useColor ? `${code}${text}${COLORS.reset}` : text;

  const labels = rows.map((r) => featureLabel(r.feature));
  const featW = labels.map((l) => Math.max(3, l.length));
  const labeled = targets
    .map((t) => ({ t, label: t === 'claude-code' ? 'Claude' : t }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const targetW = Math.max(6, ...labeled.map((x) => x.label.length));
  const widths = [targetW, ...featW];

  const hline = (l: string, m: string, r: string): string =>
    c(COLORS.dim, l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r);
  const V = c(COLORS.dim, '│');
  const wrapRow = (cells: string[]): string => V + cells.map((cell) => ` ${cell} `).join(V) + V;

  const header = wrapRow([
    c(COLORS.bold + COLORS.cyan, 'Target'.padEnd(targetW)),
    ...labels.map((l, i) => c(COLORS.bold + COLORS.magenta, center(l, featW[i]!))),
  ]);

  const lines: string[] = [hline('┌', '┬', '┐'), header, hline('├', '┼', '┤')];
  labeled.forEach(({ t, label }, idx) => {
    const cells = [
      c(COLORS.cyan, label.padEnd(targetW)),
      ...rows.map((r, i) => {
        const level = (r.support[t] ?? 'none') as SupportLevel;
        const sym = useColor ? coloredSymbol(level) : LEVEL_SYMBOL[level];
        // The symbol is one visible char; center it within the column.
        const pad = featW[i]! - 1;
        const left = Math.floor(pad / 2);
        return ' '.repeat(left) + sym + ' '.repeat(pad - left);
      }),
    ];
    lines.push(wrapRow(cells));
    lines.push(idx === labeled.length - 1 ? hline('└', '┴', '┘') : hline('├', '┼', '┤'));
  });
  if (labeled.length === 0) lines.push(hline('└', '┴', '┘'));

  const legend =
    c(COLORS.green, '✓') +
    ' native  ' +
    c(COLORS.blue, '◆') +
    ' embedded  ' +
    c(COLORS.yellow, '◐') +
    ' partial  ' +
    c(COLORS.dim, '–') +
    ' none';

  return [...lines, '', legend].join('\n');
}
