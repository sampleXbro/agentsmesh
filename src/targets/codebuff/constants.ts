/**
 * Codebuff (Freebuff) target constants.
 *
 * SOURCE OF TRUTH IS THE REPOSITORY, NOT A DOCS SITE.
 * `freebuff.com/docs` is 404, and the legacy `codebuff.com/docs` describes a
 * `knowledge.md > AGENTS.md > CLAUDE.md` priority the code does not implement:
 * `common/src/constants/knowledge.ts` declares exactly
 * `KNOWLEDGE_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md']`, and
 * `sdk/src/__tests__/knowledge-file-selection.test.ts` asserts bare
 * `knowledge.md` is NOT a knowledge file. Every path below was read from
 * github.com/CodebuffAI/freebuff and is pinned by fixture tests.
 *
 *   - **Project**: `AGENTS.md` at the repo root, nested `<dir>/AGENTS.md` per
 *     directory, `.agents/skills/<name>/SKILL.md`, `.agents/mcp.json`,
 *     `.codebuffignore`
 *   - **Global**: `~/.AGENTS.md`, `~/.agents/skills/`, `~/.agents/mcp.json`
 *
 * ONE KNOWLEDGE FILE PER DIRECTORY. `selectKnowledgeFilePaths` (sdk/src/run-state.ts)
 * groups candidates by directory and keeps the highest-priority one, so
 * `AGENTS.md` always beats `CLAUDE.md` (case-insensitively). The same holds for
 * the home directory, where `~/.AGENTS.md` beats `~/.CLAUDE.md`. agentsmesh
 * emits only the `AGENTS.md` member of each pair — writing both would be dead
 * bytes the tool never reads.
 *
 * PRECEDENCE IS INVERTED vs every other agentsmesh target, AND THE CODE
 * COMMENTS ARE WRONG. `getDefaultAgentDirs` (sdk/src/agents/load-agents.ts) and
 * `getDefaultMcpConfigDirs` (sdk/src/agents/load-mcp-config.ts) both return
 * `[cwd/.agents, cwd/../.agents, ~/.agents]` and merge with last-write-wins, so
 * the GLOBAL `~/.agents` entry OVERRIDES the project one — even though
 * load-mcp-config.ts claims "project MCP servers override global ones".
 * A user who expects agentsmesh project scope to win for MCP will be surprised.
 * Skills are the exception: `resolveSkillsDirs` (sdk/src/skills/load-skills.ts)
 * orders home BEFORE project, so project skills win as usual.
 *
 * A THIRD MIDDLE SCOPE EXISTS that agentsmesh cannot express: `cwd/../.agents`
 * (the parent directory, for monorepos) is searched between project and global.
 * agentsmesh has only project and global scopes; the middle one is a documented
 * limitation, not something to model.
 */

export const CODEBUFF_TARGET = 'codebuff';

// Project-level paths
export const CODEBUFF_ROOT_FILE = 'AGENTS.md';
export const CODEBUFF_SKILLS_DIR = '.agents/skills';
export const CODEBUFF_MCP_FILE = '.agents/mcp.json';
export const CODEBUFF_IGNORE_FILE = '.codebuffignore';

/**
 * Global paths are relative to the user's home directory. `~/.AGENTS.md` is a
 * dotfile at the home root (see `loadUserKnowledgeFiles`), NOT `~/.agents/AGENTS.md` —
 * that one belongs to Warp.
 */
export const CODEBUFF_GLOBAL_ROOT_FILE = '.AGENTS.md';
export const CODEBUFF_GLOBAL_SKILLS_DIR = '.agents/skills';
export const CODEBUFF_GLOBAL_MCP_FILE = '.agents/mcp.json';

// Canonical paths
