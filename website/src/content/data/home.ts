/** Homepage content. Copy lives here so the MDX and components stay lean. */

export interface HomeStep {
  title: string;
  body: string;
  code: string;
}

export interface HomeLink {
  title: string;
  body: string;
  href: string;
  mono?: string;
}

export const HOME_STEPS: readonly HomeStep[] = [
  {
    title: 'Write once',
    body: 'One `.agentsmesh/` folder holds rules, commands, agents, skills, MCP servers, hooks, ignore and permissions. Existing tool configs import in one step.',
    code: 'agentsmesh init',
  },
  {
    title: 'Generate everywhere',
    body: 'Native files for every enabled tool, written where each tool expects them. Round-trip metadata keeps import lossless.',
    code: 'agentsmesh generate',
  },
  {
    title: 'Stay in sync',
    body: 'Diff, lint and check catch drift in review and CI. Watch regenerates on save.',
    code: 'agentsmesh check',
  },
];

export const HOME_SYNC: readonly HomeLink[] = [
  {
    title: 'Rules',
    mono: 'rules/',
    body: 'Root and scoped instructions.',
    href: './canonical-config/rules/',
  },
  {
    title: 'Commands',
    mono: 'commands/',
    body: 'Slash commands and prompts.',
    href: './canonical-config/commands/',
  },
  {
    title: 'Agents',
    mono: 'agents/',
    body: 'Subagent definitions.',
    href: './canonical-config/agents/',
  },
  {
    title: 'Skills',
    mono: 'skills/',
    body: 'SKILL.md plus supporting files.',
    href: './canonical-config/skills/',
  },
  {
    title: 'MCP servers',
    mono: 'mcp.json',
    body: 'One server list for every client.',
    href: './canonical-config/mcp-servers/',
  },
  {
    title: 'Hooks',
    mono: 'hooks.yaml',
    body: 'Lifecycle hooks and wrapper scripts.',
    href: './canonical-config/hooks/',
  },
  {
    title: 'Ignore',
    mono: 'ignore',
    body: 'One list, every ignore format.',
    href: './canonical-config/ignore-patterns/',
  },
  {
    title: 'Permissions',
    mono: 'permissions.yaml',
    body: 'Allow and deny lists.',
    href: './canonical-config/permissions/',
  },
];

export const HOME_LESSON_LOOP: readonly { title: string; body: string }[] = [
  {
    title: 'Recall',
    body: 'Before an edit or a risky command, the agent asks the memory what applies to this file.',
  },
  { title: 'Act', body: 'It does the work with those rules in front of it.' },
  {
    title: 'Capture',
    body: 'After a failure or a review comment, it writes one short rule with a trigger.',
  },
];

export const HOME_LESSON_LINKS: readonly { text: string; href: string }[] = [
  { text: 'Lessons guide', href: './guides/lessons/' },
  { text: 'CLI reference', href: './cli/lessons/' },
];

export const HOME_DEEPER: readonly HomeLink[] = [
  { title: 'CLI reference', body: 'Every command, flag and exit code.', href: './cli/' },
  {
    title: 'Programmatic API',
    body: 'Typed ESM entry points for scripts and CI.',
    href: './reference/programmatic-api/',
  },
  {
    title: 'Share across repos',
    body: 'Extends, packs and local overrides.',
    href: './guides/sharing-config/',
  },
  {
    title: 'Global mode',
    body: 'Sync your personal setup from `~/.agentsmesh/`.',
    href: './cli/init/',
  },
  {
    title: 'Build a plugin',
    body: 'Add a new tool as a runtime target.',
    href: './guides/building-plugins/',
  },
  {
    title: 'Compare',
    body: 'AgentsMesh vs Ruler and rulesync.',
    href: './reference/alternatives/',
  },
];

export interface HomeFaq {
  question: string;
  answer: string;
}

export const HOME_FAQ: readonly HomeFaq[] = [
  {
    question: 'Which AI coding tools does AgentsMesh support?',
    answer:
      'Every major CLI agent, IDE integration and cloud agent, from Claude Code and Cursor to GitHub Copilot, Gemini CLI, Codex CLI, Windsurf and Zed. The support matrix lists native, embedded and partial coverage per feature.',
  },
  {
    question: 'How do I keep CLAUDE.md, AGENTS.md and Cursor rules in sync?',
    answer:
      'Write the rule once in `.agentsmesh/rules/`, run `agentsmesh generate`, and each file is written in its native format. `agentsmesh check` fails CI when a generated file drifts.',
  },
  {
    question: 'Does it work with config I already have?',
    answer:
      'Yes. `agentsmesh init` detects existing tool folders and imports them into `.agentsmesh/`. Import is lossless, so a later export restores the originals.',
  },
  {
    question: 'What are lessons?',
    answer:
      'A shared, git-tracked memory of short rules with triggers. Agents recall matching rules before an edit and capture new ones after a failure, in any tool.',
  },
  {
    question: 'Do I need Node.js?',
    answer:
      'No. Homebrew and the standalone binary run without Node. The npm package needs Node.js 20.19 or newer and also exposes the TypeScript API.',
  },
  {
    question: 'Is AgentsMesh free?',
    answer:
      'Yes. It is open source under the MIT license, with no hosted service and telemetry off by default.',
  },
];

/** Output paths drawn on the hero mesh. Decorative; the matrix page is the source of truth. */
/** A tool card in the hero hub: display name, icon key (see tool-icons.mjs), connector colour. */
export interface HomeHubTool {
  name: string;
  icon: string;
  color: string;
}

/** Left and right columns of the hero hub, top to bottom, as on the banner. */
export const HOME_HUB_LEFT: readonly HomeHubTool[] = [
  { name: 'Claude Code', icon: 'claude', color: '#F28B3C' },
  { name: 'Cursor', icon: 'cursor', color: 'var(--sl-color-gray-2)' },
  { name: 'GitHub Copilot', icon: 'copilot', color: '#4B8BF0' },
];
export const HOME_HUB_RIGHT: readonly HomeHubTool[] = [
  { name: 'Gemini CLI', icon: 'gemini', color: '#4285F4' },
  { name: 'Codex CLI', icon: 'codex', color: '#8B6CF6' },
  { name: 'Windsurf', icon: 'windsurf', color: '#14B8A6' },
];

/** The lessons ring around the hub, and the store it reads from. */
export const HOME_HUB_LOOP = {
  recall: 'recall',
  capture: 'capture',
  store: 'Lessons Subsystem',
  more: 'and more',
} as const;
