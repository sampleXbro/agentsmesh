/**
 * MCP tool descriptors for the install / uninstall / installs-list pipeline.
 *
 * All three tools run with `force: true` internally — MCP has no stdin TTY,
 * so the documented `--force` defaults are accepted for every interactive
 * prompt (bulk select, broken-link, modified-files). For finer-grained
 * selection, use the CLI directly.
 */

import { z } from 'zod';
import { installHandlers } from '../handlers/install.js';
import { refreshHandlers } from '../handlers/refresh.js';
import type { ToolDescriptor } from './types.js';

const InstallInput = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      'Pack source — GitHub/GitLab shorthand (`github:org/repo[@ref]`), git URL, SSH URL, or local path (`local:./relative/dir`).',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Subdirectory within the source repo to install from. Combined with `as` for manual single-category installs.',
    ),
  target: z
    .string()
    .optional()
    .describe(
      'Target tool ID hint for native-format auto-discovery (e.g. `claude-code`, `cursor`). Bypasses the multi-signal classifier.',
    ),
  as: z
    .enum(['rules', 'commands', 'agents', 'skills'])
    .optional()
    .describe(
      'Manual install kind. When set, the source is treated as a flat collection of that category (skips the auto-classifier).',
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Override the generated install entry name (default: derived from `org-repo` shorthand or the source path).',
    ),
  extends: z
    .boolean()
    .optional()
    .describe(
      'Record as an `extends:` entry in `agentsmesh.yaml` instead of materializing a pack in `.agentsmesh/packs/`. Always-on-latest semantics; resolved every `generate`.',
    ),
  all: z
    .boolean()
    .optional()
    .describe(
      'Install every sub-pack from a marketplace source (`.claude-plugin/marketplace.json`) or every flat collection in a multi-collection layout.',
    ),
  sync: z
    .boolean()
    .optional()
    .describe('Reinstall missing packs from `.agentsmesh/installs.yaml` instead of from `source`.'),
  dry_run: z.boolean().optional().describe('Preview what would be installed without writing.'),
  global: z
    .boolean()
    .optional()
    .describe(
      'Install into the global scope (`~/.agentsmesh/`) instead of the project scope. Regenerates user-level outputs.',
    ),
});

const UninstallInput = z.object({
  names: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Install names to remove (from `installs.yaml`). Required unless `all: true`. Each name removes the pack directory under `.agentsmesh/packs/`, the matching `installs.yaml` row, and the matching `agentsmesh.yaml` `extends:` row when present.',
    ),
  all: z
    .boolean()
    .optional()
    .describe('Remove every install in the current scope. `names` is ignored when `all: true`.'),
  keep_pack: z
    .boolean()
    .optional()
    .describe(
      'Leave `.agentsmesh/packs/<name>/` on disk; only drop yaml entries. Useful when the user has locally-modified files.',
    ),
  keep_generated: z
    .boolean()
    .optional()
    .describe(
      'Skip the post-uninstall `generate` pass. Target trees keep now-stale files until the next manual `generate`; a warning lists what will be cleaned then.',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe(
      'Preview the removal plan; no writes. Legacy-manifest migration runs in memory only.',
    ),
  global: z
    .boolean()
    .optional()
    .describe('Uninstall from the global scope (`~/.agentsmesh/`) instead of the project scope.'),
});

const InstallsListInput = z.object({
  global: z
    .boolean()
    .optional()
    .describe('Read from `~/.agentsmesh/installs.yaml` instead of the project scope.'),
});

const RefreshInput = z.object({
  names: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Pack names to refresh. Omit or pass empty array to refresh every installed pack in the current scope.',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe('Preview the refresh plan (resolved refs, drift detection) without writing.'),
  global: z
    .boolean()
    .optional()
    .describe('Refresh packs in the global scope (`~/.agentsmesh/`) instead of the project scope.'),
});

export const INSTALL_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'install',
    description:
      "Install a community pack from a URL or local path. Auto-classifies the source layout (anthropic-skill-pack, canonical-agentsmesh, tool-native, or unknown) and dispatches accordingly; `--target` / `--as` override the classifier. Always runs non-interactively (every prompt accepts its documented `--force` default). `skippedSettings`, when present, lists the pack settings the generate after install did not write because the project's own files do not manage them (see the generate tool).",
    inputSchema: InstallInput,
    handler: (ctx, i) => installHandlers.install(ctx, i as never),
  },
  {
    name: 'uninstall',
    description:
      'Remove one or more installed packs. Drops the pack directory, the `installs.yaml` row, and the matching `agentsmesh.yaml` `extends:` row (when present), then runs `generate` so stale target files are cleaned. Mid-batch failures are isolated; survivors still apply and the response surfaces failures in `data.failed[]`.',
    inputSchema: UninstallInput,
    handler: (ctx, i) => installHandlers.uninstall(ctx, i as never),
  },
  {
    name: 'installs_list',
    description:
      'List installed packs in the current scope. Read-only. Hydrates `installed_at` and `source_type` from each pack manifest where available; both are `null` for legacy packs without `.agentsmesh-install-manifest.json`.',
    inputSchema: InstallsListInput,
    handler: (ctx, i) => installHandlers.installsList(ctx, i as never),
    resourceUri: 'agentsmesh://installs',
  },
  {
    name: 'refresh',
    description:
      'Re-fetch and re-apply installed packs against their originally-recorded source/ref. Branch pins re-resolve to the current tip; tag pins re-resolve in case the tag moved; SHA pins stay put. Per-pack atomic via `materializePack` — a failure leaves the affected pack at its prior state. Always runs non-interactively (force: true) over MCP.',
    inputSchema: RefreshInput,
    handler: (ctx, i) => refreshHandlers.refresh(ctx, i as never),
  },
];
