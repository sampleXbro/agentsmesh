import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from './router.js';
import { printCommandHelp, printHelp } from './help.js';
import { printVersion } from './version.js';
import { handleError } from './error-handler.js';
import { muteLogger } from '../utils/output/logger.js';
import { cmdHandlers } from './command-handlers.js';
import { flagTakesValue } from './flag-spec.js';
import { silenceUi } from './ui/ui.js';
import { makeStdioBlocking } from './stdio-blocking.js';

/** A parsed flag value: a string, a boolean (presence), or — when the flag is repeated — an array of its string values. */
export type CliFlagValue = string | boolean | string[];
export type CliFlags = Record<string, CliFlagValue>;

export interface ParseResult {
  command: string;
  flags: CliFlags;
  args: string[];
}

/**
 * Global flags that are always boolean. They never consume the following token
 * as a value, so `--json lessons topics` keeps `lessons` as the command instead
 * of swallowing it as the flag's value. Note: `--version` is intentionally NOT
 * here — `plugin add --version <ref>` reads it as a value to pin a release.
 */
const VALUELESS_FLAGS = new Set(['json', 'verbose', 'help']);

/** Accumulate repeated string flags into an array so `--x a --x b` yields `[a, b]` rather than dropping `a`. */
function setFlag(flags: CliFlags, name: string, value: string | boolean): void {
  const existing = flags[name];
  if (existing === undefined || typeof value === 'boolean') {
    flags[name] = value;
    return;
  }
  if (Array.isArray(existing)) existing.push(value);
  else if (typeof existing === 'string') flags[name] = [existing, value];
  else flags[name] = value;
}

/**
 * Parses CLI arguments into command and flags.
 * @param argv - process.argv.slice(2)
 * @returns command name and flags object
 */
export function parseArgs(argv: string[]): ParseResult {
  const flags: CliFlags = {};
  const args: string[] = [];
  let command = 'help';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // Global --version / --help only apply before the command token is seen
    if (command === 'help' && arg === '--version')
      return { command: 'version', flags: {}, args: [] };
    if (command === 'help' && arg === '--help') return { command: 'help', flags: {}, args: [] };
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      // Boolean flags never take a value, so `--dry-run <pack>` keeps the pack
      // as a positional. Flags unknown to the help table stay value-hungry.
      const isBoolean = VALUELESS_FLAGS.has(name) || flagTakesValue(command, name) === false;
      if (eq !== -1) {
        const raw = arg.slice(eq + 1);
        setFlag(flags, name, isBoolean ? raw !== 'false' : raw);
        continue;
      }
      const next = argv[i + 1];
      if (isBoolean || next === undefined || next.startsWith('--')) {
        setFlag(flags, name, true);
      } else {
        setFlag(flags, name, next);
        i++;
      }
      continue;
    }
    if (command === 'help') {
      command = arg;
    } else {
      args.push(arg);
    }
  }
  return { command, flags, args };
}

const router = createRouter(cmdHandlers);

export async function main(parsed: ParseResult): Promise<void> {
  const { command, flags, args } = parsed;

  if (command === 'help') {
    printHelp();
    return;
  }
  if (command === 'version') {
    printVersion();
    return;
  }
  if (flags.help === true) {
    printCommandHelp(command, args);
    return;
  }

  if (flags.json === true) {
    muteLogger();
    silenceUi();
  }

  await router.route(command, flags, args);
}

export function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  const ourPath = fileURLToPath(import.meta.url);
  try {
    const invokedResolved = resolve(process.cwd(), invoked);
    return invokedResolved === ourPath || realpathSync(invokedResolved) === realpathSync(ourPath);
  } catch {
    return invoked.endsWith('cli.js') || invoked.includes('agentsmesh');
  }
}

if (isMainModule()) {
  // Before any output: a piped stdout is async, and every command that emits
  // its payload then calls `process.exit` would truncate at the pipe buffer.
  makeStdioBlocking();
  const parsed = parseArgs(process.argv.slice(2));
  main(parsed).catch((err) =>
    handleError(err instanceof Error ? err : new Error(String(err)), {
      verbose: parsed.flags.verbose === true,
      json: parsed.flags.json === true,
      command: parsed.command,
    }),
  );
}
