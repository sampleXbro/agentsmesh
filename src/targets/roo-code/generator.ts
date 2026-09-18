import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles } from '../../core/types.js';
import type { GenerateFeatureContext } from '../catalog/target.interface.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { mapAgentToolsToRooGroups } from './mode-groups.js';
import {
  ROO_CODE_TARGET,
  ROO_CODE_ROOT_RULE,
  ROO_CODE_RULES_DIR,
  ROO_CODE_COMMANDS_DIR,
  ROO_CODE_SKILLS_DIR,
  ROO_CODE_MCP_FILE,
  ROO_CODE_IGNORE,
  ROO_CODE_MODES_FILE,
  ROO_CODE_VSCODE_SETTINGS,
  ROO_CODE_ALLOWED_COMMANDS_KEY,
  ROO_CODE_DENIED_COMMANDS_KEY,
} from './constants.js';

export type RooCodeOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): RooCodeOutput[] {
  const outputs: RooCodeOutput[] = [];
  const root = canonical.rules.find((rule) => rule.root);

  if (root) {
    outputs.push({
      path: ROO_CODE_ROOT_RULE,
      content: root.body.trim() || '',
    });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes(ROO_CODE_TARGET)) continue;
    const slug = basename(rule.source, '.md');
    outputs.push({
      path: `${ROO_CODE_RULES_DIR}/${slug}.md`,
      content: rule.body.trim() || '',
    });
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): RooCodeOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    return {
      path: `${ROO_CODE_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateMcp(canonical: CanonicalFiles): RooCodeOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    {
      path: ROO_CODE_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}

/**
 * Roo Code's RooIgnoreController only ever reads `.rooignore` from the open
 * workspace (`path.join(cwd, '.rooignore')`) — there is no home-directory /
 * global ignore concept. Global scope is capability 'none': emit nothing.
 */
export function generateIgnore(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RooCodeOutput[] {
  if (ctx?.scope === 'global') return [];
  if (canonical.ignore.length === 0) return [];
  return [{ path: ROO_CODE_IGNORE, content: canonical.ignore.join('\n') }];
}

export function generateSkills(canonical: CanonicalFiles): RooCodeOutput[] {
  return generateEmbeddedSkills(canonical, ROO_CODE_SKILLS_DIR);
}

/**
 * Build a single Roo Code custom-mode entry. `roleDefinition` and `groups`
 * are REQUIRED by Roo's `modeConfigSchema` (no default) — omitting either
 * makes `CustomModesManager.loadModesFromFile()` drop ALL modes in the file.
 */
export function buildCustomMode(agent: CanonicalFiles['agents'][number]): Record<string, unknown> {
  const slug = basename(agent.source, '.md');
  const mode: Record<string, unknown> = { slug, name: agent.name };
  if (agent.description) mode.description = agent.description;
  mode.roleDefinition = agent.body.trim() || agent.description || agent.name;
  mode.groups = mapAgentToolsToRooGroups(agent);
  return mode;
}

export function generateAgents(canonical: CanonicalFiles): RooCodeOutput[] {
  if (canonical.agents.length === 0) return [];
  const customModes = canonical.agents.map(buildCustomMode);
  return [{ path: ROO_CODE_MODES_FILE, content: yamlStringify({ customModes }) }];
}

/**
 * Roo Code contributes `roo-cline.allowedCommands` / `roo-cline.deniedCommands`
 * as ordinary (non `scope: application`) VS Code settings (src/package.json),
 * so they ARE settable per-project in `.vscode/settings.json` — a genuine,
 * deterministic file. Scoped to command-prefix allow/deny only: there is no
 * Roo Code equivalent for the canonical "ask" bucket, and no broader
 * Read/Edit/Bash permission taxonomy. Global scope has no deterministic VS
 * Code user-settings path within `--global`'s single root, so this only
 * fires for project scope.
 */
export function generatePermissions(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RooCodeOutput[] {
  if (ctx?.scope === 'global') return [];
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  if (allow.length === 0 && deny.length === 0) return [];
  const settings: Record<string, string[]> = {};
  if (allow.length > 0) settings[ROO_CODE_ALLOWED_COMMANDS_KEY] = allow;
  if (deny.length > 0) settings[ROO_CODE_DENIED_COMMANDS_KEY] = deny;
  return [{ path: ROO_CODE_VSCODE_SETTINGS, content: JSON.stringify(settings, null, 2) }];
}
