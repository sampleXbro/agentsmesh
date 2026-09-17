/**
 * Generate Codebuff target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`               — root rule body, verbatim
 *   - `<dir>/AGENTS.md`         — one nested knowledge file per scoped directory
 *   - `.agents/skills/`         — skills, plus commands projected as skills
 *   - `.agents/mcp.json`        — MCP servers under the `mcpServers` key
 *   - `.codebuffignore`         — canonical ignore patterns (gitignore syntax)
 *
 * `AGENTS.md`, the nested files and `.agents/skills/` are SHARED with other
 * targets, so every serializer here is the shared one used verbatim: byte
 * identity is what keeps `resolveOutputCollisions` from hard-failing. The
 * nested-file grouping that keeps Codex's bytes contiguous lives in
 * `nested-rules.ts`.
 *
 * Agents, hooks and permissions are `partial` — see the stubs at the bottom.
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { appendEmbeddedRulesBlock } from '../projection/managed-blocks.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { eligibleRules, groupByNestedPath } from './nested-rules.js';
import { serializeCodebuffMcp } from './mcp-format.js';
import {
  CODEBUFF_ROOT_FILE,
  CODEBUFF_SKILLS_DIR,
  CODEBUFF_MCP_FILE,
  CODEBUFF_IGNORE_FILE,
} from './constants.js';

export type CodebuffOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): CodebuffOutput[] {
  const outputs: CodebuffOutput[] = [];
  const rootBody = canonical.rules.find((rule) => rule.root)?.body.trim() ?? '';
  if (rootBody) outputs.push({ path: CODEBUFF_ROOT_FILE, content: rootBody });

  for (const [path, rules] of groupByNestedPath(eligibleRules(canonical))) {
    const content = rules
      .map((rule) => rule.body.trim())
      .filter((body) => body.length > 0)
      .join('\n\n');
    if (content) outputs.push({ path, content });
  }

  return outputs;
}

/**
 * Global scope has exactly one knowledge file (`~/.AGENTS.md`) and no directory
 * walk above the home directory, so scoped rules are embedded into it instead
 * of nesting.
 */
export function renderCodebuffGlobalInstructions(canonical: CanonicalFiles): string {
  const rootBody = canonical.rules.find((rule) => rule.root)?.body.trim() ?? '';
  return appendEmbeddedRulesBlock(rootBody, eligibleRules(canonical));
}

export function generateSkills(canonical: CanonicalFiles): CodebuffOutput[] {
  return generateEmbeddedSkills(canonical, CODEBUFF_SKILLS_DIR);
}

/**
 * Codebuff has no slash-command file format — `cli/src/data/slash-commands` are
 * built-in CLI verbs, not user files. Commands project onto the skill surface
 * the agent already loads on demand via the `skill` tool.
 */
export function generateCommands(canonical: CanonicalFiles): CodebuffOutput[] {
  return canonical.commands.map((command) => ({
    path: `${CODEBUFF_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

/**
 * `mcpFileSchema` (sdk/src/agents/load-mcp-config.ts) is `{ mcpServers }`, but
 * each server is validated by a STRICT union — see `mcp-format.ts` for why the
 * canonical entries cannot be written verbatim.
 */
export function generateMcp(canonical: CanonicalFiles): CodebuffOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [{ path: CODEBUFF_MCP_FILE, content: serializeCodebuffMcp(canonical.mcp) }];
}

/** `PROJECT_IGNORE_FILES` (common/src/util/project-ignore.ts) parses gitignore syntax. */
export function generateIgnore(canonical: CanonicalFiles): CodebuffOutput[] {
  if (canonical.ignore.length === 0) return [];
  return [{ path: CODEBUFF_IGNORE_FILE, content: canonical.ignore.join('\n') }];
}

export const generateAgents = NO_OUTPUTS;

export const generateHooks = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;
