import type { CliFlags } from './index.js';
import { handleResult } from './json-handler.js';
import { emitJson } from './json-output.js';
import { runGenerate } from './commands/generate.js';
import { renderGenerate } from './renderers/generate.js';
import { runInit } from './commands/init.js';
import { renderInit } from './renderers/init.js';
import { createClackPrompter } from './prompts/clack-prompter.js';
import { runImport } from './commands/import.js';
import { runDiff } from './commands/diff.js';
import { runLintCmd } from './commands/lint.js';
import { renderLint } from './renderers/lint.js';
import { renderCheck } from './renderers/check.js';
import { renderImport } from './renderers/import.js';
import { renderDiff } from './renderers/diff.js';
import { renderMerge } from './renderers/merge.js';
import { runMatrix } from './commands/matrix.js';
import { renderMatrix } from './renderers/matrix.js';
import { runWatch } from './commands/watch.js';
import { runCheck } from './commands/check.js';
import { runMerge } from './commands/merge.js';
import { runInstall } from './commands/install.js';
import { renderInstall } from './renderers/install.js';
import { runUninstall } from './commands/uninstall.js';
import { renderUninstall } from './renderers/uninstall.js';
import { runRefresh } from './commands/refresh.js';
import { renderRefresh } from './renderers/refresh.js';
import { runInstalls } from './commands/installs.js';
import { renderInstalls } from './renderers/installs.js';
import { runPlugin } from './commands/plugin.js';
import { renderPlugin } from './renderers/plugin.js';
import { runTarget } from './commands/target.js';
import { renderTarget } from './renderers/target.js';
import { runConvert } from './commands/convert.js';
import { renderConvert } from './renderers/convert.js';
import { runMcp } from './commands/mcp.js';
import { runLessons } from './commands/lessons.js';
import { renderLessons } from './renderers/lessons.js';
import { ui } from './ui/ui.js';

/**
 * Collapse repeated-flag arrays to their last value for the (vast majority of)
 * commands whose handlers expect a single value per flag. Only `lessons`
 * consumes repeated flags (multiple `--trigger-file`), so it receives the full
 * {@link CliFlags} untouched; every other command keeps last-wins semantics.
 */
function narrowFlags(flags: CliFlags): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  // A repeated flag is a non-empty array, so the last element is always present.
  for (const [k, v] of Object.entries(flags)) out[k] = Array.isArray(v) ? v[v.length - 1]! : v;
  return out;
}

/**
 * True when an install/uninstall/refresh run may show an interactive prompt: a
 * real TTY on both streams and neither --force nor --dry-run (both bypass every
 * prompt). Such runs must NOT hold a spinner — its redraw timer overwrites the
 * prompt line, hiding the question and hanging the command on stdin. `--json`
 * maps to --force upstream for install/uninstall, and refresh reads json→force
 * internally, so json runs never reach a prompt either way.
 */
function mayPrompt(nf: Record<string, string | boolean>): boolean {
  return (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true &&
    nf.force !== true &&
    nf['dry-run'] !== true
  );
}

export type CommandHandler = (flags: CliFlags, args: string[]) => Promise<void>;

export const cmdHandlers: Record<string, CommandHandler> = {
  generate: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    ui.intro('agentsmesh generate');
    const sp = ui.spinner();
    sp.start('Generating tool config…');
    // Suppress the in-run matrix print — it would write over the active
    // spinner's line. Render it cleanly after the frame closes (below).
    const result = await runGenerate(nf, undefined, { printMatrix: false });
    sp.stop('Generate complete');
    handleResult('generate', result, nf, () => renderGenerate(result));
    ui.outro('Done');
    if (nf.json !== true) {
      const matrixResult = await runMatrix(nf, process.cwd());
      renderMatrix(matrixResult, { verbose: nf.verbose === true });
    }
  },
  init: async (flags, _args) => {
    void _args;
    // Interactive on a real TTY (project or --global); --yes/--json/non-TTY bypass it.
    const interactive =
      process.stdin.isTTY === true &&
      process.stdout.isTTY === true &&
      flags.yes !== true &&
      flags.json !== true;
    const deps = interactive ? { prompter: createClackPrompter() } : {};
    const result = await runInit(
      process.cwd(),
      {
        yes: flags.yes === true,
        global: flags.global === true,
        lessons: flags.lessons === true,
        targets:
          typeof flags.targets === 'string'
            ? flags.targets.split(',').map((t) => t.trim())
            : undefined,
        allTargets: flags['all-targets'] === true,
      },
      deps,
    );
    // Only an actual wizard run renders its own output (clack intro/summary/outro).
    // The lessons-only retrofit on an already-initialized project returns without a
    // wizard, so it still needs renderInit. (A plain re-init throws before returning.)
    const wizardRan = interactive && result.data.lessonsOnly !== true;
    handleResult(
      'init',
      result,
      narrowFlags(flags),
      wizardRan ? () => {} : () => renderInit(result),
    );
  },
  import: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    ui.intro('agentsmesh import');
    const sp = ui.spinner();
    sp.start('Importing…');
    const result = await runImport(nf);
    sp.stop('Import complete');
    handleResult('import', result, nf, () => renderImport(result));
    ui.outro('Done');
  },
  diff: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    const result = await runDiff(nf);
    handleResult('diff', result, nf, () => renderDiff(result));
  },
  lint: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    const result = await runLintCmd(nf);
    handleResult('lint', result, nf, () => renderLint(result));
  },
  check: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    const result = await runCheck(nf);
    handleResult('check', result, nf, () => renderCheck(result));
  },
  merge: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    const result = await runMerge(nf);
    handleResult('merge', result, nf, () => renderMerge(result));
  },
  matrix: async (flags, args) => {
    void args;
    const nf = narrowFlags(flags);
    const result = await runMatrix(nf);
    handleResult('matrix', result, nf, () =>
      renderMatrix(result, { verbose: nf.verbose === true }),
    );
  },
  watch: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    if (nf.json === true) {
      emitJson('watch', { success: false, error: '--json is not supported with watch' });
      process.exit(1);
      return;
    }
    const handle = await runWatch(nf);
    const stop = (): void => {
      void handle.stop().then(() => process.exit(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  },
  install: async (flags, args) => {
    const nf = narrowFlags(flags);
    if (nf.json === true) nf.force = true;
    ui.intro('agentsmesh install');
    // An animated spinner and an interactive readline prompt cannot share a TTY:
    // the spinner's redraw timer overwrites the prompt line, so the confirmation
    // question is invisible and the install hangs waiting for stdin. When the run
    // may prompt (real TTY, no --force/--dry-run), skip the spinner and let the
    // prompt flow own the terminal.
    const sp = mayPrompt(nf) ? null : ui.spinner();
    sp?.start('Installing…');
    const result = await runInstall(nf, args, process.cwd());
    sp?.stop('Install complete');
    handleResult('install', result, nf, () => renderInstall(result));
    ui.outro('Done');
  },
  uninstall: async (flags, args) => {
    const nf = narrowFlags(flags);
    if (nf.json === true) nf.force = true;
    ui.intro('agentsmesh uninstall');
    // See install: the spinner must yield the TTY to the interactive prompt flow.
    const sp = mayPrompt(nf) ? null : ui.spinner();
    sp?.start('Removing…');
    const result = await runUninstall(nf, args, process.cwd());
    sp?.stop('Uninstall complete');
    handleResult('uninstall', result, nf, () => renderUninstall(result));
    ui.outro('Done');
  },
  refresh: async (flags, args) => {
    const nf = narrowFlags(flags);
    ui.intro('agentsmesh refresh');
    // See install: refresh reaches an interactive consent prompt (packs with
    // local edits, no --force/--dry-run) via runConsentPrompt → readLine. The
    // spinner must yield the TTY to that prompt or it hangs/times-out unseen.
    const sp = mayPrompt(nf) ? null : ui.spinner();
    sp?.start('Refreshing…');
    const result = await runRefresh(nf, args, process.cwd());
    sp?.stop('Refresh complete');
    handleResult('refresh', result, nf, () => renderRefresh(result));
    ui.outro('Done');
  },
  installs: async (flags, args) => {
    const nf = narrowFlags(flags);
    const result = await runInstalls(nf, args, process.cwd());
    handleResult('installs', result, nf, () => renderInstalls(result));
  },
  plugin: async (flags, args) => {
    const nf = narrowFlags(flags);
    const result = await runPlugin(nf, args, process.cwd());
    handleResult('plugin', result, nf, () => renderPlugin(result));
  },
  target: async (flags, args) => {
    const nf = narrowFlags(flags);
    const result = await runTarget(nf, args, process.cwd());
    handleResult('target', result, nf, () => renderTarget(result));
  },
  convert: async (flags, _args) => {
    void _args;
    const nf = narrowFlags(flags);
    ui.intro('agentsmesh convert');
    const sp = ui.spinner();
    sp.start('Converting…');
    const result = await runConvert(nf);
    sp.stop('Convert complete');
    handleResult('convert', result, nf, () => renderConvert(result));
    ui.outro('Done');
  },
  mcp: async (flags, args) => {
    await runMcp(narrowFlags(flags), args);
  },
  lessons: async (flags, args) => {
    // lessons is the only command that consumes repeated flags — pass the full
    // (possibly array-valued) flags through; handleResult only needs scalars.
    const result = await runLessons(flags, args, process.cwd());
    handleResult('lessons', result, narrowFlags(flags), () => renderLessons(result));
    if (result.exitCode !== 0) process.exit(result.exitCode);
  },
};
