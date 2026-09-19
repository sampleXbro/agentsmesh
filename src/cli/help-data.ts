import { LESSONS_SUBCOMMANDS } from './commands/lessons-usage.js';

export interface HelpFlag {
  name: string;
  description: string;
}

export interface HelpCommand {
  name: string;
  usage: string;
  description: string;
  flags: HelpFlag[];
}

export const GLOBAL_FLAGS: HelpFlag[] = [
  { name: '--help', description: 'Show this help output and exit' },
  { name: '--version', description: 'Print CLI version and exit' },
  { name: '--verbose', description: 'Show full error details on failure' },
  { name: '--json', description: 'Output machine-readable JSON (single envelope to stdout)' },
];

export const COMMANDS: HelpCommand[] = [
  {
    name: 'init',
    usage: 'agentsmesh init [flags]',
    description:
      'Create agentsmesh.yaml, agentsmesh.local.yaml, and canonical .agentsmesh scaffold. ' +
      'On a TTY runs an interactive wizard (targets, import, generate; plus lessons in project scope, ' +
      'never in --global); --yes, --json, and non-TTY/CI run non-interactively. Targets default to the ' +
      'tools found in the project, else those installed on this machine, else a minimal set.',
    flags: [
      {
        name: '--global',
        description:
          'Initialize canonical home config under ~/.agentsmesh/ (global targets include claude-code, antigravity, codex-cli, cursor, gemini-cli, kilo-code)',
      },
      {
        name: '--yes',
        description:
          'Auto-import detected tool configs, then add example scaffold only under empty canonical paths',
      },
      {
        name: '--targets <csv>',
        description:
          'Enable exactly these target IDs (comma-separated), instead of detecting them',
      },
      {
        name: '--all-targets',
        description: 'Enable every target in the starter set instead of only detected ones',
      },
      {
        name: '--lessons',
        description:
          'Scaffold the lessons recall + capture subsystem under .agentsmesh/lessons/ and append the procedural rule to .agentsmesh/rules/_root.md. Project mode only. Safe to run on an already-initialized project to retroactively add the subsystem.',
      },
    ],
  },
  {
    name: 'generate',
    usage: 'agentsmesh generate [flags]',
    description: 'Generate target files from canonical sources',
    flags: [
      {
        name: '--global',
        description:
          'Generate user-level config from ~/.agentsmesh/ (e.g. claude-code, antigravity, codex-cli, gemini-cli, kilo-code; Cursor writes ~/.cursor/rules, ~/.cursor/AGENTS.md, hooks, ignore, MCP, skills, agents, commands; legacy ~/.agentsmesh-exports/cursor/user-rules.md is import-only)',
      },
      { name: '--targets <csv>', description: 'Limit generation to target IDs (comma-separated)' },
      { name: '--check', description: 'Check drift only; exit non-zero when out of sync' },
      { name: '--dry-run', description: 'Preview file changes without writing outputs' },
      { name: '--force', description: 'Bypass lock-strategy blocked feature violations' },
      { name: '--refresh-cache', description: 'Refresh remote extends cache before loading' },
      { name: '--no-cache', description: 'Alias for --refresh-cache' },
    ],
  },
  {
    name: 'import',
    usage: 'agentsmesh import --from <target> [flags]',
    description: 'Import existing tool config into canonical .agentsmesh files',
    flags: [
      { name: '--from <target>', description: 'Source tool ID to import from (required)' },
      {
        name: '--global',
        description:
          'Import from user-level paths into ~/.agentsmesh/ (claude-code, antigravity, codex-cli, gemini-cli, kilo-code; cursor reads ~/.cursor/{rules,AGENTS.md,mcp.json,hooks.json,cursorignore,skills,agents,commands} and legacy ~/.agentsmesh-exports/cursor/user-rules.md)',
      },
    ],
  },
  {
    name: 'convert',
    usage: 'agentsmesh convert --from <target> --to <target> [flags]',
    description: 'Convert configuration directly from one tool to another',
    flags: [
      { name: '--from <target>', description: 'Source tool ID to convert from (required)' },
      { name: '--to <target>', description: 'Destination tool ID to convert to (required)' },
      { name: '--global', description: 'Convert user-level config (use home directory paths)' },
      { name: '--dry-run', description: 'Preview conversion without writing files' },
    ],
  },
  {
    name: 'install',
    usage: 'agentsmesh install <source> [flags]',
    description:
      'Install rules/commands/agents/skills from a local path or remote repo. Auto-classifies anthropic-skill-pack / canonical-agentsmesh / tool-native sources. When auto-detection is ambiguous or refuses a non-standard layout, override with: --path <dir> to narrow scope, --as <kind> to force a flat collection (rules|commands|agents|skills), --target <id> to lock the native importer, or --all to install every sub-pack of a marketplace.',
    flags: [
      {
        name: '<source>',
        description: 'GitHub/GitLab/tree/blob URL, git+ URL, SSH, or local path',
      },
      {
        name: '--sync',
        description: 'Reinstall missing packs recorded in .agentsmesh/installs.yaml',
      },
      {
        name: '--path <dir>',
        description: 'Subdirectory inside source repo when not embedded in URL',
      },
      {
        name: '--target <id>',
        description: 'Native format used for import-at-root discovery (same as extends.target)',
      },
      {
        name: '--as <kind>',
        description: 'Manual collection mode: rules, commands, agents, or skills',
      },
      { name: '--name <id>', description: 'Override generated install entry/pack name' },
      {
        name: '--extends',
        description: 'Write install as extends entry instead of materialized pack',
      },
      {
        name: '--dry-run',
        description: 'Preview only (no YAML write, no pack write, no generate)',
      },
      {
        name: '--global',
        description: 'Install into ~/.agentsmesh/ and regenerate user-level config',
      },
      {
        name: '--all',
        description: 'Install every sub-pack from a marketplace source',
      },
      {
        name: '--force',
        description:
          'Non-interactive mode; include invalid resources and skip selection prompts (implied by --json)',
      },
      {
        name: '--accept-hooks',
        description:
          'Trust hooks.yaml from a non-local source. Stripped by default — hook commands run as shell on tool events.',
      },
      {
        name: '--accept-permissions',
        description:
          'Trust permissions.yaml from a non-local source. Stripped by default — grants allowlist tool capabilities.',
      },
      {
        name: '--accept-mcp',
        description:
          'Trust mcp.json from a non-local source. Stripped by default — MCP launch specs spawn child processes.',
      },
      {
        name: '--accept-elevated',
        description: 'Convenience for --accept-hooks --accept-permissions --accept-mcp together.',
      },
    ],
  },
  {
    name: 'installs',
    usage: 'agentsmesh installs <subcommand> [flags]',
    description: 'Read-only inventory of installed packs (subcommands: list)',
    flags: [
      { name: 'list', description: 'List installed packs (NAME, SOURCE, FEATURES, INSTALLED)' },
      { name: '--global', description: 'Read from ~/.agentsmesh/installs.yaml' },
    ],
  },
  {
    name: 'uninstall',
    usage: 'agentsmesh uninstall <name>[,<name>...] [flags]',
    description: 'Remove an installed pack; cleans installs.yaml, extends, and generated outputs',
    flags: [
      {
        name: '<name>',
        description: 'Install entry name from installs.yaml (comma-separated for batch)',
      },
      { name: '--all', description: 'Remove every installed pack in this scope' },
      {
        name: '--keep-pack',
        description: 'Keep .agentsmesh/packs/<name>/ on disk; only drop yaml/extends entries',
      },
      {
        name: '--keep-generated',
        description: 'Skip the post-uninstall generate pass; warn about stale target files',
      },
      { name: '--global', description: 'Uninstall from ~/.agentsmesh/' },
      { name: '--dry-run', description: 'Preview removal plan; no writes' },
      {
        name: '--force',
        description:
          'Non-interactive mode; accept all prompts (delete-anyway on modifications). Implied by --json.',
      },
    ],
  },
  {
    name: 'refresh',
    usage: 'agentsmesh refresh [<name>...] [flags]',
    description: 'Re-fetch and re-apply installed packs from their recorded sources',
    flags: [
      {
        name: '<name>',
        description: 'Pack name(s) to refresh (defaults to all installed packs)',
      },
      { name: '--dry-run', description: 'Preview what would be refreshed without writing' },
      { name: '--force', description: 'Skip drift-consent prompts; refresh even modified packs' },
      { name: '--global', description: 'Refresh packs installed in ~/.agentsmesh/' },
    ],
  },
  {
    name: 'diff',
    usage: 'agentsmesh diff [flags]',
    description: 'Show patch-style output for what generate would change',
    flags: [
      { name: '--global', description: 'Diff against outputs generated from ~/.agentsmesh/' },
      { name: '--targets <csv>', description: 'Limit diff to target IDs (comma-separated)' },
    ],
  },
  {
    name: 'lint',
    usage: 'agentsmesh lint [flags]',
    description: 'Validate canonical files against target constraints',
    flags: [
      { name: '--global', description: 'Lint canonical home config under ~/.agentsmesh/' },
      { name: '--targets <csv>', description: 'Limit linting to target IDs (comma-separated)' },
    ],
  },
  {
    name: 'watch',
    usage: 'agentsmesh watch [flags]',
    description: 'Watch canonical files and regenerate on change',
    flags: [
      {
        name: '--global',
        description: 'Watch ~/.agentsmesh/ and regenerate user-level config',
      },
      {
        name: '--targets <csv>',
        description: 'Limit watched generate/matrix output to target IDs',
      },
    ],
  },
  {
    name: 'check',
    usage: 'agentsmesh check',
    description: 'Verify canonical files still match .agentsmesh/.lock',
    flags: [
      { name: '--global', description: 'Check ~/.agentsmesh/.lock' },
      {
        name: '--no-outputs',
        description: 'Skip verification of generated target outputs against the lock',
      },
    ],
  },
  {
    name: 'merge',
    usage: 'agentsmesh merge',
    description: 'Resolve .agentsmesh/.lock merge conflicts from current canonical state',
    flags: [{ name: '--global', description: 'Resolve ~/.agentsmesh/.lock conflicts' }],
  },
  {
    name: 'matrix',
    usage: 'agentsmesh matrix [flags]',
    description: 'Print compatibility matrix for enabled features and targets',
    flags: [
      {
        name: '--global',
        description: 'Show matrix for canonical home config under ~/.agentsmesh/',
      },
      { name: '--targets <csv>', description: 'Limit matrix columns to target IDs' },
      { name: '--verbose', description: 'Include expanded feature details in matrix output' },
    ],
  },
  {
    name: 'target',
    usage: 'agentsmesh target scaffold <id> [--name <displayName>] [--force]',
    description: 'Generate a new target skeleton (files, tests, fixture) under src/targets/<id>/.',
    flags: [
      { name: '--name <displayName>', description: 'Human-readable name (defaults to id)' },
      { name: '--force', description: 'Overwrite existing files' },
    ],
  },
  {
    name: 'plugin',
    usage: 'agentsmesh plugin <add|list|remove|info> [args] [flags]',
    description: 'Manage plugin-provided targets (npm packages exporting a TargetDescriptor).',
    flags: [
      { name: '--version <v>', description: 'Pin plugin version (add)' },
      { name: '--id <id>', description: 'Override derived plugin id (add)' },
    ],
  },
  {
    name: 'mcp',
    usage: 'agentsmesh mcp',
    description: 'Start the agentsmesh MCP server (stdio)',
    flags: [],
  },
  {
    name: 'lessons',
    usage: 'agentsmesh lessons <subcommand> [args] [flags]',
    // Enumeration is generated from the canonical subcommand list so this
    // description can never drift from the real CLI surface.
    description: `Query and capture lessons from .agentsmesh/lessons/lessons.json. Subcommands: ${LESSONS_SUBCOMMANDS.join(', ')}.`,
    flags: [
      {
        name: '--file <path>',
        description: 'query: project-relative path of the file about to be edited',
      },
      { name: '--cmd <command>', description: 'query: shell command about to run' },
      { name: '--keyword <text>', description: 'query: free-form task description' },
      { name: '--format plain|md|json', description: 'query: output format (default plain)' },
      { name: '--top <n>', description: 'query: keep the top n ranked matches (default 10)' },
      { name: '--all', description: 'query: return every match (no cap)' },
      { name: '--max-tokens <n>', description: 'query: cap results by cumulative rule-token cost' },
      {
        name: '--always',
        description: 'query: include always-on lessons (scope: always) in the result',
      },
      {
        name: '--session <id>|auto',
        description:
          'query: suppress lessons already delivered in this session (auto derives the key)',
      },
      {
        name: '--no-dedup',
        description: 'query: re-show lessons the session dedup would suppress',
      },
      { name: '--ids', description: 'query: print only the matching lesson ids' },
      { name: '--rule "<text>"', description: 'add: imperative rule (required)' },
      { name: '--topic <id>', description: 'add: topic id (required; use --new-topic for new)' },
      {
        name: '--trigger-file <glob>',
        description: 'add: file_glob trigger (repeat the flag; value is opaque)',
      },
      {
        name: '--trigger-cmd <regex>',
        description: 'add: command_pattern trigger, valid regex (repeat the flag)',
      },
      {
        name: '--trigger-kw <text>',
        description: 'add: keyword trigger (repeat the flag; value is opaque)',
      },
      {
        name: '--evidence <ref>',
        description: 'add: evidence reference (commit:SHA, lesson:id, …)',
      },
      {
        name: '--rationale <text>',
        description: 'add: optional why-this-matters note stored on the lesson',
      },
      { name: '--new-topic --topic-summary "..."', description: 'add: create a new topic' },
      {
        name: '--scope always',
        description: 'add: always-on lesson delivered on every task, no trigger needed',
      },
      { name: '--superseded-by <id>', description: 'deprecate: replacement lesson id' },
      {
        name: '--dry-run',
        description: 'strip-markers: preview changes; report the count without writing',
      },
      {
        name: '--json',
        description: 'stats: emit the recall-telemetry report as JSON instead of the text summary',
      },
      { name: '--apply', description: 'prune: write the curation (dry-run by default)' },
      { name: '--cap <n>', description: 'prune: override the per-lesson trigger cap' },
      {
        name: '--merge',
        description:
          'import-md: fold legacy lessons into an existing lessons.json (recover stranded)',
      },
      { name: '--force', description: 'import-md: overwrite existing lessons.json' },
      { name: '--migrated-at <ISO date>', description: 'import-md: stamp on imported lessons' },
    ],
  },
];
