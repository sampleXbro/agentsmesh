# Install / Uninstall Internals

Contributor-facing reference for the install pipeline that ships in `src/install/`. Aimed at engineers extending source classification, prompt UX, or the uninstall lifecycle. End-user docs live under [`website/src/content/docs/cli/install.mdx`](../../website/src/content/docs/cli/install.mdx) and [`uninstall.mdx`](../../website/src/content/docs/cli/uninstall.mdx).

## Pipeline shape

```text
agentsmesh install <url>
    │
    ▼
acquire .agentsmesh/.install.lock                    src/install/lock/install-lock.ts
    │
    ▼
parse-install-source.ts (existing)                   src/install/source/
    │
    ▼
classify-source.ts (multi-signal)                    src/install/classify/
    │   ↳ --target / --as bypass: existing native importer
    ▼
SourceType dispatch
    ├─ canonical-agentsmesh    loadCanonicalFiles()
    ├─ anthropic-skill-pack    aggregate.ts          src/sources/anthropic-skill-pack/
    ├─ tool-native             existing native importer
    └─ unknown                 loadCanonicalSliceAtPath()
    │
    ▼
prompt flow (skill-pack only)                        src/install/run/run-install-prompts.ts
    ├─ broken-link-prompt.ts  (B1, 3 options)
    └─ bulk-prompt.ts         (A1, 3 tiers)
    │
    ▼
pack-writer (staging-dir + rename atomic)            src/install/pack/
    │  writes pack.yaml + .agentsmesh-install-manifest.json
    ▼
installs.yaml upsert                                 src/install/core/install-manifest.ts
    │
    ▼
release .install.lock
    │
    ▼
generate (cleanupStaleGeneratedOutputs)              src/core/generate/stale-cleanup.ts
```

`agentsmesh uninstall <name>` reuses the same lock + the manifest, then walks the apply path described under [Uninstall lifecycle](#uninstall-lifecycle).

## Multi-signal classifier

`src/install/classify/`:

- `types.ts` — `SignalName`, `Signal`, `SourceType`, `SIGNAL_WEIGHTS`, `SKILL_PACK_THRESHOLD = 1.4`.
- `signals.ts` — five pure predicate functions:

  | Signal | Predicate | Weight |
  |---|---|---|
  | `skill-pack-layout` | ≥1 `skills/<name>/SKILL.md` with `name` or `description` frontmatter | 1.0 (PRIMARY) |
  | `agents-dir` | ≥1 `agents/<name>.md` with frontmatter (boilerplate filtered) | 0.4 |
  | `references-dir` | ≥1 `references/<name>.md` | 0.3 |
  | `multi-tool-rules` | ≥2 of `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` at root | 0.3 |
  | `per-target-commands` | ≥1 `.md` in any descriptor-declared `.<tool>/commands/` directory (derived at module load from every `managedOutputs.dirs` matching `^\.[^/]+\/commands$`) | 0.4 |

- `classify-source.ts` — composes the signals:

  ```text
  if exists(.agentsmesh/)                                → canonical-agentsmesh
  elif PRIMARY met AND sum(matched weights) ≥ 1.4        → anthropic-skill-pack
  elif matches a registered tool-native signature         → tool-native
  else                                                    → unknown
  ```

Reference scores: `addyosmani/agent-skills` → 1.0 + 0.4 + 0.3 + 0.3 + 0.4 = 2.4 (skill-pack). A drive-by repo with one stray `SKILL.md` → 1.0 < 1.4 (falls through). The threshold is verified against five tool-native fixtures in `tests/integration/install-backcompat.integration.test.ts`.

`--target` and `--as` skip the classifier entirely and route to the existing native importer; the manifest records `source_type: null` for those rows.

## Anthropic skill-pack aggregate

`src/sources/anthropic-skill-pack/`:

- `index.ts` — `SourceDescriptor` (importers + `mergeFromToolDirs` policy).
- `aggregate.ts` — orchestrates `classify → import → merge → broken-link scan`. Surfaces `brokenLinks: EntityWithBrokenLinks[]` for the prompt layer.
- `merge-commands.ts` — dedupes per-target command dirs by `basename(file, '.md')`. Default precedence: claude (1) > gemini (2). Three-way conflicts (root `commands/` + `.claude/commands/` + `.gemini/commands/`) resolve to root.
- `link-scan.ts` — builds `includedPaths` (relative POSIX) + detects relative links via `scan-relative-links.ts` (fenced-block aware) + classifies them via `resolve-link.ts` (in-tree-included / resolvable-outside / unresolvable).
- `apply-decisions.ts` — pure body+supportingFiles mutation given a `BrokenLinkDecision[]`. Aggressive global regex rewrite is safe because fenced blocks were excluded at scan time.

## Entity importers + boilerplate filter

`src/install/importers/`:

- `boilerplate-filter.ts` — `isBoilerplate(filename)`; case-insensitive match against `README.md`, `LICENSE`, `CHANGELOG.md`, and similar metadata files. Applied at the install layer ONLY (canonical parsers must let users name their own `security.md`, etc., per the P0 scope correction).
- `entity-importers.ts` — `importAgents`, `importCommands`, `importRules`, `importSkills`; each wraps the existing canonical parser plus the boilerplate filter.

## Prompts

`src/install/prompts/`:

- `prompt-io.ts` — injectable `readLine(prompt, { input, output })`; resolves to `''` on EOF for uniform handling.
- `prompt-types.ts` — `PromptAdapter { ask, write }`.
- `bulk-prompt.ts` — A1 three-tier. Tier 1 `[a/n/s]` blank/EOF/unknown → abort. Tier 2 `[y/n/c]` same. Tier 3 `[y/N/a/q]` blank is documented default `N`. `bypass=true` returns everything without prompting (no banner).
- `broken-link-prompt.ts` — B1 three options `[i]nclude / [l]eave / [a]bort`. `bypass=true` defaults to `[l]eave-with-warnings`.
- `modified-files-prompt.ts` — uninstall drift prompt `[d]elete-anyway / [k]eep / [a]bort`. `bypass=true` defaults to `[d]`.

Test plumbing note: `runInstall` and `runUninstall` construct `defaultAdapter()` internally. Adding adapter injection through these entry points was rejected (expands public API for tests only); interactive prompt branches are unit-covered, integration tests exercise only `--force` and the orchestrator's hand-off paths.

## Pack writer + manifest

`src/install/pack/pack-writer.ts`:

1. Write all pack files + `.agentsmesh-install-manifest.json` to `.agentsmesh/packs/<name>.tmp/`.
2. `fs.rename()` to `.agentsmesh/packs/<name>/`.
3. Update `installs.yaml` via `writeFileAtomic`.
4. On error before step 2: `rm -rf` staging; abort.

`src/install/manifest/install-manifest-hash.ts`:

- `INSTALL_MANIFEST_FILENAME = '.agentsmesh-install-manifest.json'` (namespaced so user pack content can't collide).
- `hashPackFiles(packDir)` — deterministic, ordering-independent. Excludes `pack.yaml` and the manifest itself so metadata churn never registers as drift.
- Manifest shape:

  ```json
  {
    "name": "addyosmani-agent-skills",
    "source": "github:addyosmani/agent-skills@5b4c6da",
    "installed_at": "2026-05-16T10:00:00.000Z",
    "extends_id": null,
    "source_type": "anthropic-skill-pack",
    "files": { "skills/x/SKILL.md": "sha256:..." }
  }
  ```

## Pack-name preservation

`src/install/core/install-name.ts` — `findExistingInstallName(manifest, parsedSource)` normalises both sides to canonical `github:<org>/<repo>` (strips ref, `.git`, protocol variance) and looks for a matching `installs.yaml` row.

The executor (`run-install-execute.ts`) gates re-use on an additional identity scope (`target + as + features`) via the local `pickReuseEntryName` helper. An existing pack is never renamed: a re-install keeps the pack's name, and the executor reports the name `installAsPack` returns.

`install-pack-target.ts` — `resolveInstallPack` picks the pack a re-install updates, always within the same source, `target` and `as`: the exact feature-set match, else the pack named by an explicit `--name`, else the single whole-source pack (no pick, no path) when the install is whole-source too. When both sides cover the whole source, `installAsPack` replaces the pack through `materializePack` (like `refresh`, keeping `installed_at`); a picked subset merges. A new pack that would take a name held by an unrelated pack fails with `packNameCollision`. With `dryRun`, `installAsPack` does the same lookup and name check, then returns the name without writing.

## Uninstall lifecycle

`src/install/uninstall/`:

- `plan-uninstall.ts` — pure `UninstallRemovalPlan` computation. Honors `--keep-pack`, `--keep-generated`, `--all`. Matches `extends:` rows by `name` (not by source). `manifestEntry` is nullable so install-`--extends` rows (which never wrote to `installs.yaml`) can still be uninstalled.
- `detect-modified.ts` — `detectModifiedFiles(packDir, manifestFiles)`; returns `modified | deleted | added` per file, sorted by `relativePath`.
- `legacy-manifest-migration.ts` — when a pack predates `.agentsmesh-install-manifest.json`, the current contents become the baseline; warns the user that local edits since install can't be detected. Throws when `pack.yaml` is missing or invalid (cannot synthesise provenance).
- `uninstall-decisions.ts` — per-pack loop: missing pack → soft delete; otherwise migrate-legacy → detect-modified → modified-files prompt. Returns `RemovalDecision[]` plus an `aborted` flag.
- `apply-uninstall.ts` — per-decision executor: `rm -rf` pack dir (unless `--keep-pack` or `keep-modified`), drop `installs.yaml` row, drop matching `agentsmesh.yaml` `extends:` row. Atomic yaml rewrites.
- `uninstall-result.ts` — builds the `UninstallData` payload (preview + applied flavors).
- `run-uninstall.ts` — orchestrator; same lock + scope handling as `runInstall`.

Post-apply, the orchestrator runs `runGenerate()` so `cleanupStaleGeneratedOutputs` evicts orphaned target files. `--keep-generated` skips that step and emits a single warning.

## Concurrent-install lock

`src/install/lock/install-lock.ts` wraps the shared `acquireProcessLock` primitive used by `.generate.lock`. Filename: `.install.lock` under the scope's `canonicalDir`. Both `runInstall` and `runUninstall` acquire it at the top of their body. `--sync` replay holds the same lock across all recursive `runInstall` calls (the recursive invocation is signaled by the `replay` parameter and skips re-acquisition).

Contention surfaces as `LockAcquisitionError` from `src/core/errors.ts`. Integration coverage: `tests/integration/install-uninstall-concurrent.integration.test.ts`.

## Test pyramid

- **Unit**: classifier signals + decision rule, prompt UX, entity importers, plan-uninstall, detect-modified, legacy-manifest-migration, install-manifest-hash. Strict over loose assertions.
- **Integration** (`tests/integration/`):
  - `install-anthropic-pack.integration.test.ts` — exact 23/3/7/1 counts, manifest shape, target outputs.
  - `install-broken-link.integration.test.ts` — `--force` leave-with-warnings path.
  - `install-targeted.integration.test.ts` — `--as`, `--target`, `--path` bypasses.
  - `install-backcompat.integration.test.ts` — 5 fixtures pinning the discriminator.
  - `install-pack-name-preservation.integration.test.ts` — local re-install idempotency.
  - `install-atomicity.integration.test.ts` — staging-dir + rename contract.
  - `install-skill-pack.integration.test.ts` — minimal end-to-end happy path.
  - `uninstall-{basic,modified,missing,extends,dry-run,all,keep-generated,legacy-pack}.integration.test.ts`.
  - `installs-list.integration.test.ts` — install/list/uninstall round-trip.
  - `install-uninstall-concurrent.integration.test.ts` — lock contention.

## Out of scope

- Multi-target generate collisions (`.agents/skills/...` shared by amp and gemini-cli) — separate fix.
- HTTP/HTTPS link validation — future `--check-http`.
- TUI checkbox prompts (A3).
- Top-level `.agentsmesh/references/` canonical category.
- Pack updates (`update` command). `install --force` is the upgrade path.
- `installs show`, `installs prune`, `installs verify` — future PRs if needed.
