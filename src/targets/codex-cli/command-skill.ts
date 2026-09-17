import { toToolsArray as toStringArray } from '../import/shared-import-helpers.js';
import type { CanonicalCommand } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';

export const CODEX_COMMAND_SKILL_PREFIX = 'am-command-';
export const LEGACY_CODEX_COMMAND_SKILL_PREFIX = 'ab-command-';

interface ParsedCommandSkill {
  name: string;
  description: string;
  allowedTools: string[];
}

export function commandSkillDirName(name: string): string {
  return `${CODEX_COMMAND_SKILL_PREFIX}${name}`;
}

export function serializeCommandSkill(command: CanonicalCommand): string {
  const frontmatter: Record<string, unknown> = {
    name: commandSkillDirName(command.name),
    description: command.description || undefined,
    'x-agentsmesh-kind': 'command',
    'x-agentsmesh-name': command.name,
    'x-agentsmesh-allowed-tools':
      command.allowedTools.length > 0 ? command.allowedTools : undefined,
  };
  if (frontmatter.description === undefined) delete frontmatter.description;
  if (frontmatter['x-agentsmesh-allowed-tools'] === undefined) {
    delete frontmatter['x-agentsmesh-allowed-tools'];
  }
  return serializeFrontmatter(frontmatter, command.body.trim() || '');
}

export function parseCommandSkillFrontmatter(
  frontmatter: Record<string, unknown>,
  dirName: string,
): ParsedCommandSkill | null {
  if (frontmatter['x-agentsmesh-kind'] !== 'command') return null;

  const metadataName =
    typeof frontmatter['x-agentsmesh-name'] === 'string' ? frontmatter['x-agentsmesh-name'] : '';
  const derivedName = dirName.startsWith(CODEX_COMMAND_SKILL_PREFIX)
    ? dirName.slice(CODEX_COMMAND_SKILL_PREFIX.length)
    : dirName.startsWith(LEGACY_CODEX_COMMAND_SKILL_PREFIX)
      ? dirName.slice(LEGACY_CODEX_COMMAND_SKILL_PREFIX.length)
      : '';
  const name = (metadataName || derivedName).trim();
  if (!name) return null;

  return {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    allowedTools: toStringArray(frontmatter['x-agentsmesh-allowed-tools']),
  };
}

export function serializeImportedCommand(command: ParsedCommandSkill, body: string): string {
  return serializeFrontmatter(
    {
      description: command.description,
      'allowed-tools': command.allowedTools,
    },
    body.trim() || '',
  );
}
