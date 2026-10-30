import type { CanonicalFiles } from '../../core/types.js';
import { GEMINI_DEFAULT_POLICIES_FILE } from './constants.js';
import { GEMINI_POLICY_MARKER } from './policies-merge.js';

type RuleDecision = 'allow' | 'deny' | 'ask_user';

function escapeTomlBasicString(value: string): string {
  // JSON string escaping is close enough for TOML basic strings.
  return JSON.stringify(value);
}

function escapeRegexLiteral(value: string): string {
  // Escape all regex metacharacters so the literal is matched inside argsPattern.
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePermissionExpr(
  expr: string,
):
  | { kind: 'tool'; tool: string }
  | { kind: 'bash'; prefix: string }
  | { kind: 'read'; path: string }
  | { kind: 'unknown'; raw: string } {
  const bash = expr.match(/^Bash\((.*)\)$/);
  if (bash && typeof bash[1] === 'string') return { kind: 'bash', prefix: bash[1] };
  const read = expr.match(/^Read\((.*)\)$/);
  if (read && typeof read[1] === 'string') return { kind: 'read', path: read[1] };

  if (expr === 'Read' || expr === 'Grep' || expr === 'LS' || expr === 'WebFetch') {
    return { kind: 'tool', tool: expr };
  }

  return { kind: 'unknown', raw: expr };
}

function ruleForDecision(decision: RuleDecision, priority: number, tomlFields: string[]): string {
  return [
    GEMINI_POLICY_MARKER,
    '[[rule]]',
    `decision = ${escapeTomlBasicString(decision)}`,
    `priority = ${priority}`,
    ...tomlFields,
    '',
  ].join('\n');
}

function permissionExprToGeminiRule(
  expr: string,
  decision: RuleDecision,
  priority: number,
): string | null {
  const parsed = parsePermissionExpr(expr);

  const TOOLNAME_MAP = {
    Read: 'read_file',
    Grep: 'grep_search',
    LS: 'list_directory',
    WebFetch: 'web_fetch',
    Bash: 'run_shell_command',
  } as const;

  if (parsed.kind === 'tool') {
    const toolName = TOOLNAME_MAP[parsed.tool as keyof typeof TOOLNAME_MAP] ?? parsed.tool;
    return ruleForDecision(decision, priority, [`toolName = ${escapeTomlBasicString(toolName)}`]);
  }

  if (parsed.kind === 'bash') {
    // Canonical format uses `prefix:*` (e.g. `curl:*`). Gemini policy uses `commandPrefix`.
    const normalizedPrefix = parsed.prefix.replace(/:\*$/u, '').replace(/\*$/u, '').trim();
    return ruleForDecision(decision, priority, [
      `toolName = ${escapeTomlBasicString(TOOLNAME_MAP.Bash)}`,
      `commandPrefix = ${escapeTomlBasicString(normalizedPrefix)}`,
    ]);
  }

  if (parsed.kind === 'read') {
    return ruleForDecision(decision, priority, [
      `toolName = ${escapeTomlBasicString(TOOLNAME_MAP.Read)}`,
      `argsPattern = ${escapeTomlBasicString(escapeRegexLiteral(parsed.path))}`,
    ]);
  }

  // Preserve unrecognized expressions as best-effort toolName entries.
  return ruleForDecision(decision, priority, [`toolName = ${escapeTomlBasicString(parsed.raw)}`]);
}

export function generateGeminiPermissionsPolicies(
  canonical: CanonicalFiles,
): Array<{ path: string; content: string }> {
  if (!canonical.permissions) return [];
  const { allow = [], deny = [] } = canonical.permissions;
  const total = allow.length + deny.length;
  if (total === 0) return [];

  const rules: string[] = [];
  allow.forEach((expr, idx) => {
    const rule = permissionExprToGeminiRule(expr, 'allow', 100 + idx);
    if (rule) rules.push(rule);
  });
  deny.forEach((expr, idx) => {
    const rule = permissionExprToGeminiRule(expr, 'deny', 200 + idx);
    if (rule) rules.push(rule);
  });

  if (rules.length === 0) return [];

  return [
    {
      path: GEMINI_DEFAULT_POLICIES_FILE,
      content: rules.join('\n'),
    },
  ];
}
