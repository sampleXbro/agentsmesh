import { toToolsArray as toStringArray } from '../import/shared-import-helpers.js';
import { basename } from 'node:path';
import type { CanonicalCommand } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { COPILOT_PROMPTS_DIR } from './constants.js';

interface ParsedCommandPrompt {
  name: string;
  description: string;
  allowedTools: string[];
}

export function commandPromptPath(name: string): string {
  return `${COPILOT_PROMPTS_DIR}/${name}.prompt.md`;
}

export function serializeCommandPrompt(command: CanonicalCommand): string {
  const frontmatter: Record<string, unknown> = {
    agent: 'agent',
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

export function parseCommandPromptFrontmatter(
  frontmatter: Record<string, unknown>,
  promptPath: string,
): ParsedCommandPrompt {
  const nameFromMetadata =
    typeof frontmatter['x-agentsmesh-name'] === 'string' ? frontmatter['x-agentsmesh-name'] : '';
  const name = (nameFromMetadata || basename(promptPath, '.prompt.md')).trim();
  const allowedToolsFromMetadata = toStringArray(frontmatter['x-agentsmesh-allowed-tools']);
  const allowedTools =
    allowedToolsFromMetadata.length > 0
      ? allowedToolsFromMetadata
      : toStringArray(frontmatter.tools);

  return {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    allowedTools,
  };
}

export function serializeImportedCommand(command: ParsedCommandPrompt, body: string): string {
  return serializeFrontmatter(
    {
      description: command.description,
      'allowed-tools': command.allowedTools,
    },
    body.trim() || '',
  );
}
