/**
 * Load all canonical files from a canonical directory into CanonicalFiles.
 */

import { join } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { parseRules, type ParseFrontmatterOptions } from '../features/rules.js';
import { parseCommands } from '../features/commands.js';
import { parseAgents } from '../features/agents.js';
import { parseSkills } from '../features/skills.js';
import { parseMcp } from '../features/mcp.js';
import { parsePermissions } from '../features/permissions.js';
import { parseHooks } from '../features/hooks.js';
import { parseIgnore } from '../features/ignore.js';
import { parseCopiedFiles } from '../features/files/load.js';
import { exists } from '../../utils/filesystem/fs.js';

/**
 * Load all canonical files from a canonical directory or project root.
 * Missing directories/files yield empty arrays or null as per each parser.
 *
 * @param canonicalDirOrProjectRoot - Absolute path to canonical directory or project root
 * @param opts - Optional `onParseError` callback for lenient install-time loads.
 *               Strict callers (`generate`/`lint`/`check`) leave it unset.
 * @returns CanonicalFiles with all parsed data
 */
export async function loadCanonicalFiles(
  canonicalDirOrProjectRoot: string,
  opts: ParseFrontmatterOptions = {},
): Promise<CanonicalFiles> {
  const nestedCanonicalDir = join(canonicalDirOrProjectRoot, '.agentsmesh');
  const canonicalDir = (await exists(nestedCanonicalDir))
    ? nestedCanonicalDir
    : canonicalDirOrProjectRoot;

  const [rules, commands, agents, skills, mcp, permissions, hooks, ignore, files] =
    await Promise.all([
      parseRules(join(canonicalDir, 'rules'), opts),
      parseCommands(join(canonicalDir, 'commands'), opts),
      parseAgents(join(canonicalDir, 'agents'), opts),
      parseSkills(join(canonicalDir, 'skills'), opts),
      parseMcp(join(canonicalDir, 'mcp.json'), opts.onParseError),
      parsePermissions(join(canonicalDir, 'permissions.yaml'), opts.onParseError),
      parseHooks(join(canonicalDir, 'hooks.yaml'), opts.onParseError),
      parseIgnore(join(canonicalDir, 'ignore')),
      parseCopiedFiles(join(canonicalDir, 'files')),
    ]);

  return {
    rules,
    commands,
    agents,
    skills,
    mcp,
    permissions,
    hooks,
    ignore,
    ...(files.length > 0 ? { files } : {}),
  };
}
