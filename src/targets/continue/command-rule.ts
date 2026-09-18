import { toToolsArray as toStringArray } from '../import/shared-import-helpers.js';
import { basename } from 'node:path';
import type { CanonicalCommand } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { CONTINUE_PROMPTS_DIR } from './constants.js';

interface ParsedCommandRule {
  name: string;
  description: string;
  allowedTools: string[];
}

export function continueCommandRulePath(name: string): string {
  return `${CONTINUE_PROMPTS_DIR}/${name}.md`;
}

export function serializeCommandRule(command: CanonicalCommand): string {
  const frontmatter: Record<string, unknown> = {
    description: command.description || undefined,
    invokable: true,
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

export function parseCommandRuleFrontmatter(
  frontmatter: Record<string, unknown>,
  filePath: string,
): ParsedCommandRule {
  const fileName = basename(filePath, '.md');
  const fromMetadata =
    typeof frontmatter['x-agentsmesh-name'] === 'string' ? frontmatter['x-agentsmesh-name'] : '';
  const name = (fromMetadata || fileName).trim();
  return {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    allowedTools: toStringArray(frontmatter['x-agentsmesh-allowed-tools']),
  };
}

export function serializeImportedCommand(command: ParsedCommandRule, body: string): string {
  const frontmatter: Record<string, unknown> = {
    description: command.description || undefined,
    'allowed-tools': command.allowedTools.length > 0 ? command.allowedTools : undefined,
  };
  if (frontmatter.description === undefined) delete frontmatter.description;
  if (frontmatter['allowed-tools'] === undefined) delete frontmatter['allowed-tools'];
  return serializeFrontmatter(frontmatter, body.trim() || '');
}
