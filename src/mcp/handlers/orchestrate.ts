import type { McpContext } from '../context.js';
import { loadProjectContext, lint as engineLint, diff as engineDiff } from '../../public/index.js';
import { runCheck } from '../../cli/commands/check.js';
import { runGenerate } from '../../cli/commands/generate.js';
import {
  type CheckHandlerResult,
  type DiffHandlerResult,
  type GenerateHandlerResult,
  type LintHandlerResult,
  wrapEngineError,
} from './orchestrate-types.js';
import { convert, importFromTarget } from './orchestrate-import-convert.js';

export type {
  CheckHandlerResult,
  ConvertHandlerResult,
  DiffHandlerResult,
  GenerateHandlerResult,
  ImportHandlerResult,
  LintHandlerResult,
} from './orchestrate-types.js';

async function generate(
  ctx: McpContext,
  input: { targets?: string[]; verbose?: boolean; dry_run?: boolean },
): Promise<GenerateHandlerResult> {
  try {
    // Delegate to the CLI generate so the MCP path stays byte-for-byte
    // identical to `agentsmesh generate`: it writes target files, cleans stale
    // outputs, and — critically — persists `.agentsmesh/.lock`. Reimplementing
    // file-writing here previously skipped the lockfile and left `check`
    // permanently drifted. `printMatrix: false` suppresses the matrix render.
    const flags: Record<string, string | boolean> = { 'dry-run': input.dry_run === true };
    if (input.targets && input.targets.length > 0) {
      flags.targets = input.targets.join(',');
    }

    const { data, lockWritten } = await runGenerate(flags, ctx.projectRoot, {
      printMatrix: false,
    });

    const written = data.files.filter((f) => f.status === 'created' || f.status === 'updated');
    const byTarget: Record<string, { filesWritten: number }> = {};
    for (const f of written) {
      const entry = byTarget[f.target] ?? { filesWritten: 0 };
      byTarget[f.target] = { filesWritten: entry.filesWritten + 1 };
    }

    const result: GenerateHandlerResult = {
      filesWritten: written.length,
      byTarget,
      lockfileUpdated: lockWritten,
      errors: [],
      warnings: [],
    };

    if (input.verbose === true) result.files = data.files.map((f) => f.path);
    return result;
  } catch (e) {
    wrapEngineError(e);
  }
}

async function lint(
  ctx: McpContext,
  input: { severity?: 'error' | 'warning' | 'info' },
): Promise<LintHandlerResult> {
  try {
    const pctx = await loadProjectContext(ctx.projectRoot);
    const result = await engineLint({
      config: pctx.config,
      canonical: pctx.canonical,
      projectRoot: pctx.projectRoot,
      scope: pctx.scope,
    });
    const diagnostics = input.severity
      ? result.diagnostics.filter((d) => d.level === input.severity)
      : result.diagnostics;
    return {
      issues: diagnostics.map((d) => ({
        level: d.level,
        file: d.file,
        target: d.target,
        message: d.message,
      })),
    };
  } catch (e) {
    wrapEngineError(e);
  }
}

async function check(ctx: McpContext): Promise<CheckHandlerResult> {
  try {
    // Delegate to the CLI check, like generate, so MCP fails on what
    // `agentsmesh check` fails on (an unreadable lessons graph included).
    const { data, error } = await runCheck({}, ctx.projectRoot);
    return {
      drift: !data.inSync,
      lockConflict: data.lockConflict,
      lessonsGraphError: error ?? null,
      canonicalDrift: data.canonicalDrift,
      outputDrift: data.outputDrift,
      missing: data.removed,
      extra: data.added,
      modified: data.modified,
      outputsModified: data.outputsModified,
      outputsRemoved: data.outputsRemoved,
      outputsStale: data.outputsStale,
      outputsChecked: data.outputsChecked,
    };
  } catch (e) {
    wrapEngineError(e);
  }
}

async function diff(ctx: McpContext, input: { targets?: string[] }): Promise<DiffHandlerResult> {
  try {
    const pctx = await loadProjectContext(ctx.projectRoot);
    const targetFilter = input.targets && input.targets.length > 0 ? input.targets : undefined;
    const result = await engineDiff({
      config: pctx.config,
      canonical: pctx.canonical,
      projectRoot: pctx.projectRoot,
      scope: pctx.scope,
      targetFilter,
    });
    return {
      willCreate: result.summary.new,
      willModify: result.summary.updated,
      willDelete: result.summary.deleted,
    };
  } catch (e) {
    wrapEngineError(e);
  }
}

export const orchestrateHandlers = {
  generate,
  lint,
  check,
  diff,
  import: importFromTarget,
  convert,
};
