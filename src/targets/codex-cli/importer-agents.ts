import { AB_AGENTS } from '../../core/canonical-paths.js';
import { basename, join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { serializeImportedAgent } from '../projection/projected-agent-skill.js';
import { CODEX_TARGET, CODEX_AGENTS_DIR } from './constants.js';
import { parse as parseToml } from 'smol-toml';

export async function importCodexAgentsFromToml(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const agentsPath = join(projectRoot, CODEX_AGENTS_DIR);
  const agentsDestDir = join(projectRoot, AB_AGENTS);
  try {
    const agentFiles = await readDirRecursiveNoSymlinks(agentsPath);
    const tomlFiles = agentFiles.filter((f) => f.endsWith('.toml'));
    for (const srcPath of tomlFiles) {
      const content = await readFileSafe(srcPath);
      if (!content) continue;
      const parsed = parseToml(content) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object') continue;
      const name = typeof parsed.name === 'string' ? parsed.name : basename(srcPath, '.toml');
      const description = typeof parsed.description === 'string' ? parsed.description : '';
      const body =
        typeof parsed.developer_instructions === 'string'
          ? parsed.developer_instructions.trim()
          : '';
      const model = typeof parsed.model === 'string' ? parsed.model : '';
      const sandbox = typeof parsed.sandbox_mode === 'string' ? parsed.sandbox_mode : '';
      const permissionMode =
        sandbox === 'read-only' ? 'read-only' : sandbox === 'workspace-write' ? 'allow' : '';
      const mcpServers: string[] = Array.isArray(parsed.mcp_servers)
        ? parsed.mcp_servers.filter((s): s is string => typeof s === 'string')
        : [];
      await mkdirp(agentsDestDir);
      const destPath = join(agentsDestDir, `${name}.md`);
      const normalizedBody = normalize(body, srcPath, destPath);
      const agent = {
        name,
        description,
        tools: [],
        disallowedTools: [],
        model,
        permissionMode,
        maxTurns: 0,
        mcpServers,
        hooks: {},
        skills: [],
        memory: '',
      };
      const outContent = serializeImportedAgent(agent, normalizedBody);
      await writeFileAtomic(destPath, outContent);
      results.push({
        fromTool: CODEX_TARGET,
        fromPath: srcPath,
        toPath: `${AB_AGENTS}/${name}.md`,
        feature: 'agents',
      });
    }
  } catch {
    /* CODEX_AGENTS_DIR may not exist */
  }
}
