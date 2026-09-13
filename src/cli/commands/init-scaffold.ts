/**
 * Canonical scaffold writers for agentsmesh init.
 */

import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { exists, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';
import {
  TEMPLATE_ROOT_RULE,
  TEMPLATE_EXAMPLE_RULE,
  TEMPLATE_EXAMPLE_COMMAND,
  TEMPLATE_EXAMPLE_AGENT,
  TEMPLATE_EXAMPLE_SKILL,
  TEMPLATE_MCP,
  TEMPLATE_HOOKS,
  TEMPLATE_PERMISSIONS,
  TEMPLATE_IGNORE,
} from './init-templates.js';

function ab(canonicalDir: string, rel: string): string {
  return join(canonicalDir, rel);
}

async function countMdFiles(dir: string): Promise<number> {
  if (!(await exists(dir))) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).length;
}

async function hasAnyImportedSkill(canonicalDir: string): Promise<boolean> {
  const skillsRoot = ab(canonicalDir, 'skills');
  if (!(await exists(skillsRoot))) return false;
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_')) continue;
    if (await exists(join(skillsRoot, e.name, 'SKILL.md'))) return true;
  }
  return false;
}

/**
 * Write a template only where no file exists yet.
 *
 * `init` runs over a directory that may already hold the user's canonical
 * content: `agentsmesh.yaml` can be missing while `.agentsmesh/` is fully
 * populated (deleted by hand, lost in a merge, or never committed). Writing
 * unconditionally replaced those files with templates, so the scaffold is
 * gap-filling everywhere.
 */
async function writeIfAbsent(path: string, content: string, label: string): Promise<void> {
  if (await exists(path)) return;
  await writeFileAtomic(path, content);
  logger.success(`Created ${label}`);
}

/**
 * Write full example scaffold (fresh init, no prior import).
 * Never overwrites a canonical file that already exists.
 */
export async function writeScaffoldFull(canonicalDir: string): Promise<void> {
  const rulesDir = ab(canonicalDir, 'rules');
  await mkdirp(rulesDir);
  await writeIfAbsent(join(rulesDir, '_root.md'), TEMPLATE_ROOT_RULE, '.agentsmesh/rules/_root.md');
  await writeIfAbsent(
    join(rulesDir, '_example.md'),
    TEMPLATE_EXAMPLE_RULE,
    '.agentsmesh/rules/_example.md',
  );

  const commandsDir = ab(canonicalDir, 'commands');
  await mkdirp(commandsDir);
  await writeIfAbsent(
    join(commandsDir, '_example.md'),
    TEMPLATE_EXAMPLE_COMMAND,
    '.agentsmesh/commands/_example.md',
  );

  const agentsDir = ab(canonicalDir, 'agents');
  await mkdirp(agentsDir);
  await writeIfAbsent(
    join(agentsDir, '_example.md'),
    TEMPLATE_EXAMPLE_AGENT,
    '.agentsmesh/agents/_example.md',
  );

  const skillDir = ab(canonicalDir, join('skills', '_example'));
  await mkdirp(skillDir);
  await writeIfAbsent(
    join(skillDir, 'SKILL.md'),
    TEMPLATE_EXAMPLE_SKILL,
    '.agentsmesh/skills/_example/SKILL.md',
  );

  await writeIfAbsent(ab(canonicalDir, 'mcp.json'), TEMPLATE_MCP, '.agentsmesh/mcp.json');
  await writeIfAbsent(ab(canonicalDir, 'hooks.yaml'), TEMPLATE_HOOKS, '.agentsmesh/hooks.yaml');
  await writeIfAbsent(
    ab(canonicalDir, 'permissions.yaml'),
    TEMPLATE_PERMISSIONS,
    '.agentsmesh/permissions.yaml',
  );
  await writeIfAbsent(ab(canonicalDir, 'ignore'), TEMPLATE_IGNORE, '.agentsmesh/ignore');
}

/**
 * After `init --yes` import: add template files only where import left a category empty.
 */
export async function writeScaffoldGapFill(canonicalDir: string): Promise<void> {
  const rulesDir = ab(canonicalDir, 'rules');
  const rulesMd = await countMdFiles(rulesDir);
  const rootPath = join(rulesDir, '_root.md');
  const hasRoot = await exists(rootPath);
  await mkdirp(rulesDir);
  if (rulesMd === 0) {
    await writeFileAtomic(rootPath, TEMPLATE_ROOT_RULE);
    logger.success('Created .agentsmesh/rules/_root.md');
    await writeFileAtomic(join(rulesDir, '_example.md'), TEMPLATE_EXAMPLE_RULE);
    logger.success('Created .agentsmesh/rules/_example.md');
  } else if (!hasRoot) {
    await writeFileAtomic(rootPath, TEMPLATE_ROOT_RULE);
    logger.success('Created .agentsmesh/rules/_root.md');
  }

  const commandsDir = ab(canonicalDir, 'commands');
  if ((await countMdFiles(commandsDir)) === 0) {
    await mkdirp(commandsDir);
    await writeFileAtomic(join(commandsDir, '_example.md'), TEMPLATE_EXAMPLE_COMMAND);
    logger.success('Created .agentsmesh/commands/_example.md');
  }

  const agentsDir = ab(canonicalDir, 'agents');
  if ((await countMdFiles(agentsDir)) === 0) {
    await mkdirp(agentsDir);
    await writeFileAtomic(join(agentsDir, '_example.md'), TEMPLATE_EXAMPLE_AGENT);
    logger.success('Created .agentsmesh/agents/_example.md');
  }

  if (!(await hasAnyImportedSkill(canonicalDir))) {
    const skillDir = ab(canonicalDir, join('skills', '_example'));
    await mkdirp(skillDir);
    await writeFileAtomic(join(skillDir, 'SKILL.md'), TEMPLATE_EXAMPLE_SKILL);
    logger.success('Created .agentsmesh/skills/_example/SKILL.md');
  }

  const mcpPath = ab(canonicalDir, 'mcp.json');
  if (!(await exists(mcpPath))) {
    await writeFileAtomic(mcpPath, TEMPLATE_MCP);
    logger.success('Created .agentsmesh/mcp.json');
  }
  const hooksPath = ab(canonicalDir, 'hooks.yaml');
  if (!(await exists(hooksPath))) {
    await writeFileAtomic(hooksPath, TEMPLATE_HOOKS);
    logger.success('Created .agentsmesh/hooks.yaml');
  }
  const permsPath = ab(canonicalDir, 'permissions.yaml');
  if (!(await exists(permsPath))) {
    await writeFileAtomic(permsPath, TEMPLATE_PERMISSIONS);
    logger.success('Created .agentsmesh/permissions.yaml');
  }
  const ignorePath = ab(canonicalDir, 'ignore');
  if (!(await exists(ignorePath))) {
    await writeFileAtomic(ignorePath, TEMPLATE_IGNORE);
    logger.success('Created .agentsmesh/ignore');
  }
}
