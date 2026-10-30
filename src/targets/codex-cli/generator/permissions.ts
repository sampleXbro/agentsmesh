/**
 * Codex CLI permissions — projects canonical `allow`/`ask`/`deny` command
 * patterns onto `.codex/rules/agentsmesh-permissions.rules`, the Starlark
 * `prefix_rule(pattern, decision, justification)` DSL Codex reads for
 * out-of-sandbox command execution decisions (allow/prompt/forbidden), per
 * https://developers.openai.com/codex/rules.
 *
 * Only `Bash(<command>[:*])`-shaped canonical entries have a real command-prefix
 * equivalent; every entry (including non-Bash ones like `Read` or `WebFetch`,
 * which have no Codex command-execution equivalent) is still recorded as a
 * `# agentsmesh-permission <decision>: <pattern>` marker comment so the importer
 * can losslessly recover the exact canonical string, independent of how well the
 * best-effort tokenizer below reconstructs a `prefix_rule` for it.
 */

import type { CanonicalFiles } from '../../../core/types.js';
import { CODEX_RULES_DIR, CODEX_PERMISSIONS_RULES_BASENAME } from '../constants.js';
import type { RulesOutput } from './types.js';

type Decision = 'allow' | 'ask' | 'deny';

const DSL_DECISION: Record<Decision, string> = {
  allow: 'allow',
  ask: 'prompt',
  deny: 'forbidden',
};

/** Extracts shell command tokens from a `Bash(<command>[:*])` canonical pattern. */
function parseBashPattern(pattern: string): string[] | null {
  const match = /^Bash\((.*)\)$/s.exec(pattern.trim());
  if (!match) return null;
  let command = match[1]!.trim();
  if (command.endsWith(':*')) command = command.slice(0, -2).trim();
  if (!command) return null;
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  if (tokens.length === 0) return null;
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
}

function permissionBlock(pattern: string, decision: Decision): string {
  const marker = `# agentsmesh-permission ${decision}: ${pattern}`;
  const tokens = parseBashPattern(pattern);
  if (!tokens) {
    return [
      marker,
      `# agentsmesh: no Codex command-execution equivalent for "${pattern}" (informational only)`,
    ].join('\n');
  }
  const patternLiteral = `[${tokens.map((token) => JSON.stringify(token)).join(', ')}]`;
  return [
    marker,
    'prefix_rule(',
    `    pattern = ${patternLiteral},`,
    `    decision = ${JSON.stringify(DSL_DECISION[decision])},`,
    `    justification = ${JSON.stringify(`agentsmesh canonical permission: ${pattern}`)},`,
    ')',
  ].join('\n');
}

export function generatePermissions(canonical: CanonicalFiles): RulesOutput[] {
  const permissions = canonical.permissions;
  if (!permissions) return [];

  const entries: { pattern: string; decision: Decision }[] = [
    ...(permissions.allow ?? []).map((pattern) => ({ pattern, decision: 'allow' as const })),
    ...(permissions.ask ?? []).map((pattern) => ({ pattern, decision: 'ask' as const })),
    ...(permissions.deny ?? []).map((pattern) => ({ pattern, decision: 'deny' as const })),
  ];
  if (entries.length === 0) return [];

  const header = [
    '# agentsmesh: canonical command permissions (.agentsmesh/permissions.yaml)',
    '# allow -> decision="allow", ask -> decision="prompt", deny -> decision="forbidden"',
    '# https://developers.openai.com/codex/rules',
  ].join('\n');
  const body = entries.map((entry) => permissionBlock(entry.pattern, entry.decision)).join('\n\n');

  return [
    {
      path: `${CODEX_RULES_DIR}/${CODEX_PERMISSIONS_RULES_BASENAME}`,
      content: `${header}\n\n${body}\n`,
    },
  ];
}
