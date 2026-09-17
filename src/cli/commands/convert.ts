import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { TARGET_IDS, isBuiltinTargetId } from '../../targets/catalog/target-ids.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import { loadCanonicalFiles } from '../../canonical/load/loader.js';
import { generate as runEngine } from '../../core/generate/engine.js';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import { assertOutputBoundary, ensureSafeOutputPath } from './generate-path.js';
import { loadScopedConfig } from '../../config/core/scope.js';
import { bootstrapPlugins } from '../../plugins/bootstrap-plugins.js';
import { configSchema } from '../../config/core/schema.js';
import type { ConvertData } from '../command-result.js';

export interface ConvertCommandResult {
  exitCode: number;
  data: ConvertData;
}

function shouldSymlink(name: string, isDirectory: boolean): boolean {
  if (name === '.agentsmesh') return false;
  if (name.startsWith('.')) return true;
  if (!isDirectory) return true;
  return false;
}

function createTempProjectRoot(projectRoot: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'am-convert-'));
  const entries = readdirSync(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!shouldSymlink(entry.name, entry.isDirectory())) continue;
    const src = join(projectRoot, entry.name);
    const dest = join(tempDir, entry.name);
    symlinkSync(src, dest, entry.isDirectory() ? 'dir' : 'file');
  }
  mkdirSync(join(tempDir, '.agentsmesh'), { recursive: true });
  return tempDir;
}

export async function runConvert(
  flags: Record<string, string | boolean>,
  projectRoot?: string,
): Promise<ConvertCommandResult> {
  const root = projectRoot ?? process.cwd();
  const scope = flags.global === true ? 'global' : 'project';
  const base = scope === 'global' ? homedir() : root;
  const from = flags.from;
  const to = flags.to;

  if (typeof from !== 'string' || !from) {
    throw new Error(
      '--from is required. Example: agentsmesh convert --from cursor --to claude-code',
    );
  }
  if (typeof to !== 'string' || !to) {
    throw new Error('--to is required. Example: agentsmesh convert --from cursor --to claude-code');
  }

  const fromNorm = from.toLowerCase().trim();
  const toNorm = to.toLowerCase().trim();

  if (fromNorm === toNorm) {
    throw new Error('--from and --to must be different targets.');
  }

  const fromBuiltin = isBuiltinTargetId(fromNorm);
  const toBuiltin = isBuiltinTargetId(toNorm);

  if (!fromBuiltin || !toBuiltin) {
    try {
      const { config } = await loadScopedConfig(root, 'project');
      await bootstrapPlugins(config, root);
    } catch {
      const unknown: string[] = [];
      if (!fromBuiltin) unknown.push(`--from "${from}"`);
      if (!toBuiltin) unknown.push(`--to "${to}"`);
      throw new Error(
        `Unknown ${unknown.join(' and ')}. ` + `Supported: ${TARGET_IDS.join(', ')}.`,
      );
    }
  }

  const fromDescriptor = getDescriptor(fromNorm);
  if (!fromDescriptor) {
    throw new Error(`Unknown --from "${from}". Supported: ${TARGET_IDS.join(', ')}.`);
  }
  const toDescriptor = getDescriptor(toNorm);
  if (!toDescriptor) {
    throw new Error(`Unknown --to "${to}". Supported: ${TARGET_IDS.join(', ')}.`);
  }

  const dryRun = flags['dry-run'] === true;
  const mode: ConvertData['mode'] = dryRun ? 'dry-run' : 'convert';

  const tempDir = createTempProjectRoot(base);
  try {
    await fromDescriptor.generators.importFrom(tempDir, { scope });

    const canonical = await loadCanonicalFiles(tempDir);

    const config = configSchema.parse({
      version: 1,
      targets: toBuiltin ? [toNorm] : [],
      pluginTargets: toBuiltin ? [] : [toNorm],
    });

    const results = await runEngine({
      config,
      canonical,
      projectRoot: base,
      scope,
      targetFilter: [toNorm],
    });

    await assertOutputBoundary(results, { projectRoot: base, targets: [toNorm], scope });
    if (!dryRun) {
      for (const r of results) {
        if (r.status === 'created' || r.status === 'updated') {
          const fullPath = await ensureSafeOutputPath(base, r.path, r.target);
          await writeFileAtomic(fullPath, r.content);
        }
      }
    }

    const actionable = results.filter((r) => r.status !== 'skipped');
    const files = actionable.map((r) => ({
      path: r.path,
      target: r.target,
      status: r.status as 'created' | 'updated' | 'unchanged',
    }));

    return {
      exitCode: 0,
      data: {
        from: fromNorm,
        to: toNorm,
        mode,
        files,
        summary: {
          created: actionable.filter((r) => r.status === 'created').length,
          updated: actionable.filter((r) => r.status === 'updated').length,
          unchanged: actionable.filter((r) => r.status === 'unchanged').length,
        },
      },
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
