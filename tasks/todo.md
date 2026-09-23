# Lessons hook, merge driver and log papercuts (2026-09-23)

All items confirmed in code at 05fc2e7e; none already fixed.

- [x] A hook input: stdin drained past the 1 MB cap; BOM stripped; an unknown present event name
  does nothing (a missing one stays a tool call); Copilot VS Code SessionStart gets task recall;
  root from the touched file first; NFD paths match NFC globs
- [x] B hook output: prompt recall names what the 5-rule cap and the always-on budget hid;
  recurrence counts the last 24 hours; Cursor permission_denied not recorded; command nudge
  without the file-glob hint; dedup commit re-reads under a short lock (20 parallel: 0 lost)
- [x] C logs/files: newline before an append after a cut line; byte cap to half the trigger and
  bounded tail reads; read-only lessons.json refused, mode kept; lock-as-file message; BOM in
  lessons.json/config.json; one lock-wait notice; old *.tmp / *.stale swept on write
- [x] D merge: one-side deletions of unused triggers/topics kept; resolve from markers refuses a
  result with errors and warns without a base; counts after renames; next step per operation;
  bare driver without npx; hint compares the wired recall command; generate quiet on custom
- [x] docs (cli/lessons.mdx, reference/lessons.mdx), changeset, gate (13888 + 658 e2e, floor,
  lint, typecheck incl. tests, knip, build, astro, generate --check, check), manual repros
---

# Lessons CLI low-severity papercuts (2026-09-23)

All repros confirmed against the build at 6b8bf1e3 (none already fixed). Exit 2 = bad input.

- [x] A flags: a value flag with no value → exit 2 "--x needs a value" (+ `--x=<value>` hint); an
  unknown "flag" with a space → `--rule="--..."` hint; `lessons help [sub]`
- [x] B `prune --cap abc` / `0x10` → exit 2 (shared strict positive-int check with query)
- [x] C add input errors → exit 2 with flag names (--scope, INVALID_TOPIC_ID with a suggestion,
  TOPIC_SUMMARY_REQUIRED incl. blank, unsafe --trigger-file glob gated before write); write
  refusals → exit 2 "Refused to save the lessons graph: … Nothing was written."; internal
  prefixes removed at the source; --evidence deduped; rule length and recall clamp in characters
- [x] D --trigger-file: trim, strip ./, posix-normalize; ../ outside, folder (suggest dir/**),
  project root (also via a symlink such as macOS /tmp) all rejected, CLI + MCP
- [x] E --trigger-cmd "\u{...}" rejected by the linear engine (UNSAFE_TRIGGER_PATTERN)
- [x] F query names a failed legacy migration instead of the init hint
- [x] G import-md --migrated-at must be a real calendar date (exit 2)
- [x] H env true/false/yes/no/on/off; config warns on non-boolean switches and non-object files
- [x] I show rationale; journal [deprecated]/[superseded by x] + status in JSON; periods;
  validate summary error (JSON envelope); --ids help text; docs keyword example
- [x] docs (cli/lessons.mdx, reference/lessons.mdx, reference/mcp-server.mdx), changeset, gate
  (13836 unit+integration, 658 e2e, coverage floor, lint, typecheck incl. tests, knip, build,
  astro, generate --check, check), all repro scripts re-run on the build, commit
- Unknown topic stays exit 1 (NOT_FOUND over MCP), like other unknown ids
---

# Stable lock on no-op generate (2026-09-23)

Bug: `generate` with nothing changed still rewrites `generated_at` in `.agentsmesh/.lock`, so the
tree is dirty after every run and each teammate's run shows a lock diff.
Contract: the lock is rewritten only when its content changes (`checksums`, `extends`, `packs`,
`outputs`). `generated_at`, `generated_by` and `lib_version` then describe the last run that
changed something; comparing them would bring the churn back between teammates.

- [x] Unit tests (writeLockFile, `generate-lock-stable.test.ts`): unchanged content → byte-identical
  (later clock, other USER, other lib_version, filtered run); changed output / dropped output /
  canonical file / extends / old-format lock / unreadable lock → rewritten; cache symlink refreshed
- [x] Integration (`generate-lock-stable.integration.test.ts`): generate twice → lock bytes equal,
  git tree clean; `check` and `generate --check` exit 0; edited rule → lock rewritten
- [x] Implement in `src/cli/commands/generate-lock.ts` (`sameContent`); `merge` still always writes
- [x] Watch: no loop (manual run: 1 regen at start, 1 per edit; watch suites green)
- [x] Docs: reference/generation-pipeline.mdx + cli/generate.mdx, changeset, gate (13732
  unit+integration, 658 e2e, coverage floor, lint, typecheck, knip, build, astro, generate
  --check, check), manual git repro (init --yes, generate, commit, generate → clean), commit
- Stale "merge omits outputs" wording on 3 docs pages left for a follow-up task
---

# Local pack install defects (2026-09-23)

Source: manual QA of `agentsmesh install` from a local directory (task chip).
Rules: TDD, files <=200 lines (run-install-pack.ts is already 228: split it), no `any`, strict
artifact assertions, docs (install.mdx) + changeset. Keep the documented model: packs from one
source with different feature sets or picks stay separate; only an unambiguous same-install
re-run updates in place.

- [x] D1 re-install of a changed local pack updates it in place (`install-pack-target.ts`):
  - exact feature match, else the pack named by an explicit --name (same source, target, `as`),
    else the single whole-source pack; explicit --name to another source's pack gets a message
    that names --name (not "Auto-generated")
  - whole-source re-install onto a whole-source pack replaces its contents (like refresh,
    keeps installed_at); picks merge
  - found in manual repro: a same-feature re-install without --name renamed a local pack to the
    auto name (old `renameExistingPack`). Removed: a re-install keeps the pack name. --dry-run now
    resolves the same pack (installAsPack `dryRun`), so the preview names the real pack
- [x] D2 skill-pack detection counts any skills/<dir>/SKILL.md (not `_`/dot dirs), so skills, rules,
  README and LICENSE install together; names kept as-is (same as a lone skills folder)
- [x] D3 warn when mcp.json / hooks.yaml / permissions.yaml / ignore sit at the root of a
  non-canonical source (only a source's `.agentsmesh/` settings install); docs say so
- [x] docs (cli/install.mdx, architecture/install.md, `skills/<name>` wording), changeset, gate
  (13719 unit+integration, 658 e2e, coverage floor, lint, typecheck, knip, build, astro,
  generate --check, check), manual repro of all three, commit locally
- [x] run-install-execute.ts (252 lines) split: selection prep moved to run-install-selection.ts
  (121 + 164 lines); a before/after build diff over 10 install scenarios is identical.
---

# QA defect fixes: high + medium (2026-09-23)

Source: senior manual QA of origin/develop..HEAD (5 exploratory sessions; top defects reproduced).
User decision: fix 4 high + 17 medium now; spin off lows and the install/generate issues as tasks.
Rules: TDD (failing test first), files <=200 lines, fixers own disjoint files, frozen golden and docs
updated once at integration. Gate: full suite + floor, e2e, lint, typecheck, knip, build, QA repros.

## High
- [x] H1 hook never breaks on log I/O: best-effort JSONL writes, readers skip non-object lines, lock read guarded, doHook safety net
- [x] H2 unmerged lessons.json detected by validate/check/generate --check; merge-driver setup rejects npx-cache PATH and a monorepo npx that cannot resolve from the git top level
- [x] H3 MCP lessons tools never create a graph outside a project or in home; lessons root resolution shared with the instructions
- [x] H4 lessons CLI rejects extra positionals (unquoted rule)

## Medium
- [x] M1 repeated single-value flags rejected
- [x] M2 failed read-only tools are action-less (no recurrence record)
- [x] M3 recurrence warning deduped across a multi-file patch; hook output capped
- [x] M4 unreadable graph reported on prompt-less session starts
- [x] M5 fence: strip invisible format characters, full-width delimiters; capture hint path sanitized
- [x] M6 every lessons command and MCP tool reports an unreadable graph with the graph-problem message; SCHEMA_INVALID for schema failures
- [x] M7 resolve falls back to the working-file markers when an index side is unreadable
- [x] M8 future-dated locks become stale
- [x] M9 MCP always honors no_dedup and session
- [x] M10 MCP lessons_show accepts a lesson id
- [x] M11 MCP write refusals are VALIDATION errors with readable messages
- [x] M12 negated globs are broad
- [x] M13 upsert reports what changed
- [x] M14 lessons CLI resolves the lessons root from a subdirectory (like the hook and MCP)
- [x] M15 unusable --trigger-cmd follows the dead-trigger contract (mixed = warn, all dead = exit 2)
- [x] M16 local hooks.yaml no longer replaces pack hooks for the same event
- [x] M17 a writer that lost the lock (paused > 60 s) refuses to save

## Integration (me)
- Also fixed at integration: MCP/plugin capture falls back to the git repo root; hook is silent and CLI add/import-md refuse in the home folder; typed LessonsWriteRefusedError; hooks keep extends override per event (e2e contract) while packs combine.
- [x] resolve-conflict adopts the lock ownership check; frozen golden; docs; changeset; gate; QA repros; commit
- [x] spin off lows + install/generate issues as tasks (4 task chips)

---

# Ponytail cleanup of the unpushed lessons work (2026-09-23)

Source: ponytail review of origin/develop..HEAD (6 reviewers, claims verified; -862 lines possible).
Behavior must not change except the unreadable-graph recall wording (now the graph-problem message).
Gate: focused tests per fixer; then build, full suite + coverage floor, e2e, lint, typecheck, knip,
generate --check; differential run of old vs new dist on the same scenario; commit locally (no push).

## Foundation (me, before fan-out)
- [x] one `LESSONS_GRAPH_PATH` (graph-store.ts); every copy imports it
- [x] one sync "read text or empty" helper; one `emptyGraph()`; `graphHasConflictMarkers(root)` in graph-problem.ts

## Fixers (disjoint files)
- [x] lock: exists->existsSync, releaseOwned->evictOwners, fold backoff module, lessons-lock mkdir/alias, 2 test dups
- [x] globs: glob-safety inline/deletes, deadFileGlobIds inline, project-files, MatchBudgets, test helpers
- [x] hook: semver->isOlderVersion, emitRecall/optionalPreface/env param/cliVersion, hook-notices dedup, findUp, cli-invocation, basename/stripVT, test helpers
- [x] merge/effectiveness: git runner, pick->mergeScalar, failuresForContext, loadEffectiveness graph, validate-health, configFlag, flat memo, add.ts projectRoot, export keywords, test dups
- [x] cli/mcp/install: pack-merge dedup, query degraded+guards collapse, generate/check inline, isCaptureRejection, boundedShow, init renderer, scripts, knip, test helpers
- [x] targets: single recall projection, reverse maps, lint supported lists, recall-hook-hint, hook-assets, stale JSDoc, test builders

## Integration (me)
- [x] full gate, differential old/new run, commit locally

Skipped on purpose (not behavior-preserving or against repo convention): stripVTControlCharacters, absentGraph -> emptyGraph (v1 -> v2), flat memo Map (2.5x slower), scripts core/wrapper split, rich-plugin fixture test.
Differential old/new run: identical transcripts and trees except the intended recall wording and volatile pack metadata.

---

# Lessons critical-gap fixes (2026-09-22)

Source: Staff audit of the lessons subsystem (5 parallel reviewers, findings reproduced).
Constraint carried from the earlier plan below: the legacy migrator and `maybeAutoMigrateLessons` stay.
Gate: targeted unit tests per fixer; then ONE serialized full run (typecheck, lint, knip,
coverage + floor, e2e, generate --check), then re-run every original reproduction.
Fixers never build `dist/`, never commit, never run `lessons add` (captures are serialized at the end).

## Foundations (done first, by me)
- [x] `resolveLessonsRoot(start)` in `src/lessons/paths.ts`
- [x] `agentsmeshInvocation(root)` in `src/lessons/cli-invocation.ts` (npx only when agentsmesh is a project dependency)
- [x] H4 MCP: server instructions + lessons tool context resolve the lessons root from a subdirectory

## Critical
- [x] C1 team merge: generate/init configure the per-clone merge driver; `lessons resolve` rebuilds a conflicted graph from git stages; `check` fails on an unreadable graph; validate stops recommending `git checkout`
- [x] C2 launcher: adaptive hook + merge-driver command; hook warns visibly on version skew; generate/init team hint when agentsmesh is not a project dependency
- [x] C3 lock: owner token, compare-before-evict and compare-before-release; short stale window for the lessons lock
- [x] C4 dedup keyed on session id + agent id
- [x] C5 Codex `apply_patch` file extraction in the hook
- [x] C6 read Claude Code's top-level `error`, class past `Exit code N`; outcome log on by default (keys only), telemetry stays opt-in

## High
- [x] H1 effectiveness: attribute a failure only when it re-matches the lesson's own trigger in a bounded window; strip `cd … &&`; no deprecate advice from telemetry
- [x] H2 prune liveness: never auto-detach a glob that never matched a tracked file; partial file walk skips liveness
- [x] H3 stop wiring lessons hooks where the host cannot inject context (Cursor, Copilot, Gemini CLI, Windsurf); add documented injection paths only; matcher gaps
- [x] H4 hook resolves the lessons root from a subdirectory
- [x] H5 file_glob matching cannot backtrack exponentially; length cap; docs corrected
- [x] H6 rule clamp on every delivery path + payload cap; config budget ceilings; prompt-time recall limit
- [x] H7 recalled text fenced: one rule per line, id-labelled, delimiter neutralized
- [x] H8 legacy migration only reads files inside `.agentsmesh/lessons/`

## Also
- [x] A1 merge driver merges the same lesson field by field; deprecated/superseded wins; version = max
- [x] A2 deprecate the lesson describing the non-existent always-block projection
- [x] A3 failure reminder and capture relativize absolute file triggers

## Integration (me)
- [x] CLI hook passes the host exit code through (Copilot exit 2); dead `doValidate` removed
- [x] query handler: only printed rules are marked seen; `--always` budget; conflict names `lessons resolve`
- [x] `lessons resolve` renderer case; `check` prints the unreadable-graph error; skill + plugin skill list `resolve`
- [x] validate, prune, capture guardrails and effectiveness use the safe glob matcher (no picomatch on lesson globs)
- [x] user interrupts are not recorded as failures
- [x] hook latency with a full 5000-event outcome log: +130 ms -> +20 ms (memo + scope to ranked lessons)
- [x] changeset; lesson captures serialized
- [x] full serialized gate, original reproductions re-run, docs (README + website), commit locally (no push)
- Known limit: a lock holder paused > 60 s can still be evicted mid-write (needs an ownership check in the lock API)

---

# Ponytail cleanup — remove over-engineering across the lib

Source: repo-wide ponytail review (2026-09-17). Target: ~-3,365 lines.

**Excluded by user decision (semver-breaking on published 0.36.0):**
- lessons legacy migrator + `maybeAutoMigrateLessons` public export (-490) — KEEP
- `scope:'always'` CLI/MCP surface + graph schema v2 (-145) — KEEP

**Verification gate after every iteration:** `pnpm typecheck` + `pnpm test` (exit code
captured to a log, never piped into `tail`). Commit only on green.

## Iteration 1 — zero-caller dead code
- [x] `logger.table` + `pad` helper (0 callers)
- [x] `auditReachability` + its 2 test files (0 production callers)
- [x] legacy `TargetGenerators` registry: `legacyRegistry`, `registerTarget`, `getAllTargets`
- [x] `link-format-registry` overrides: `registerLinkFormat`, `resetLinkFormatOverrides`, cache invalidation
- [x] `createCommandMetadataWarning`, `isWindowsSafePath`
- [x] `effectiveTriggerCount`, `capRecallLog`
- [x] `resolveEffectiveTargetForInstall`, `isImplicitPickEmpty`
- [x] `usesCommandSkillProjection`, `usesAgentSkillProjection`, `TOOL_INDICATORS`
- [x] `normalizeProjectedAgentSkill`, `@deprecated BuiltinTargetDefinition` alias
- [x] 2 unconstructed `AgentsMeshErrorCode` members
- [~] `TargetOutputFamily.kind` — SKIPPED: `TargetOutputFamily` is exported from
      `src/public/targets.ts`; dropping a required field breaks plugin authors for 12 lines.
- [x] `matrix-column-labels.ts` (1-entry table, 1 caller)
- [x] `trigger-repair.ts` + `repairTriggers` config key (never set)
- [x] move `src/lessons/recurrence/` to `tests/harness/` (0 src imports)

## Iteration 2 — shared-helper dedup
- [x] `toStringArray` ×8 → `shared-import-helpers`
- [x] `isRecord` ×18, `stringList` ×7, `canonicalDocument` ×8 → shared exports
- [x] `emptyCanonical` ×4 → one export
- [x] `pruneUndefined`, `union`, `normalizeRule`, `shortHash`, `activeTriggerIds`, `todayIso`
- [x] `dirExists`, `pathExists` → existing `utils/filesystem/fs.ts`
- [x] `map-directories.ts` + third `addDirectoryMapping` copy in `map.ts`

## Iteration 3 — per-target collapses (largest)
- [x] 165 `*_CANONICAL_*` constants → widen `import-maps/constants.ts` to 9 exports
- [x] 37 `<Target>Output` interfaces → `FeatureGeneratorOutput`
- [x] 32 no-op generator stubs → shared `NO_OUTPUTS`
- [x] 20 identical `linter.ts` → `createRuleLinter(target)`
- [x] capability-gap lint (100 sites) → `unsupported(feature, target, message)`
- [x] 12 identical `generateRules` → `embeddedRootRule()`
- [x] 8 mergers → `firstMerger([...])`
- [x] `scope-extras` files → `globalOnly(fn)`
- [x] skills-adapter parameterized (cline/windsurf/copilot/cursor)
- [x] importer preamble ×25 → `beginDescriptorImport()`
- [~] skillsDir ternary ×14 → into `runDescriptorImport`
      SKIPPED: moving the skills step into the runner would start importing skills for
      targets that deliberately do not, and reorders emission for 26 targets.
- [x] `target-scaffold/templates.ts` must stop emitting the deleted constants

## Iteration 4 — stdlib / native
- [x] `utils/text/glob.ts` → `picomatch` (already a prod dep)
- [x] `formatOxfordComma` → `Intl.ListFormat`
- [x] `audit-report` `pad` → `String.padEnd`
- [x] `process-lock` `sleep` → `node:timers/promises`
- [~] `resolveNpmSpecifier` → `createRequire(...).resolve`
      SKIPPED: its doc states it must work in Bun-compiled binaries, where `createRequire`
      resolution is not equivalent.

## Iteration 5 — structural yagni
- [~] install: collapse the 3 source-grammar parsers + drop the parity test
      SKIPPED (finding was wrong): measured both parsers over 13 source forms — they agree on
      all 11 remote formats, but `parseInstallSource` is ASYNC, does filesystem I/O, and THROWS
      on generic-HTTPS and `local:`. `parseSourceUrl` is pure/sync by contract and has a sync
      caller. The parity test is load-bearing, not redundant.
- [x] `url-parser-remotes` github/gitlab pairs
- [x] `readCommands/Rules/AgentsDirWithMappers` wrappers
- [x] `SourceDescriptor` (1 impl, `id` never read)
- [x] `engine.ts` 6 copy-pasted feature blocks → loop
- [x] CLI `lint`/`diff`/`matrix` preamble → `loadProjectContext` + `parseTargetsFlag`
- [~] CLI `doQuery` → `recallLessons` (already drifted)
      SKIPPED: unifying changes recall behaviour (adds effectiveness ranking + command fastpath
      to the CLI path). Worth doing as its own behavioural change, not a line-count cleanup.
- [~] `lessons-known-flags` derived from `LESSONS_USAGE` + drop parity test
      SKIPPED: would couple CLI flag validation to help prose; `--command`/`--rule` aliases are
      absent from the usage text, and LESSONS_USAGE has historically lagged handlers.
- [~] `plugin`/`target` help banners → `printCommandHelp`
      SKIPPED: help-data carries the entries but not the per-subcommand descriptions or the
      plugin security note. Folding them in is line-neutral and degrades the help structure.
- [x] `router.ts` inline, `mcp pkgVersion` → `getVersion`, `mcp errors` const → union
- [~] `embedded-skill.ts` → `skill-import-pipeline`
      SKIPPED: the pipeline normalizes in a different order and adds reserved-name filtering —
      a behaviour change across 26 targets. Deserves its own change with round-trip coverage.
- [x] `target-catalog.ts` → `getDescriptor`
- [~] `seen-store` v2-only; `merge.ts` `mergeBy`; `pack-reader`; `layout-types`;
      PARTIAL: done — `mergeBy`/`mergeUniqueStrings`, `pack-reader` `sameFeatures`, `layout-types`
      `PathMarker`, `PLURAL` map, `emptyPrep`, collections double-stat. Not done — `seen-store`
      v2-only (touches session-dedup on-disk compatibility) and `prompt-io` options (reverted:
      it is the stream-injection seam the tests use).
      `select-candidates`; `install-discovery` branches; misc small shrinks

## Final
- [x] `pnpm lint:dead` (knip) clean
- [x] `pnpm test:e2e`
- [x] docs sync if any CLI surface changed
- [x] changeset entry


## Result

- `src/` 82,896 → 80,161 lines (**-2,735**, -3.3%); whole diff -4,000 / +1,000 across 380 files.
- Every iteration gated on `pnpm typecheck` + full `pnpm test`.
- Final: typecheck 0 · unit+integration 12,741 passed · e2e 657 passed · eslint 0 errors ·
  knip clean · catalog/capabilities/matrix verify all OK · prettier clean on changed files.
- No change to the published API surface (`src/public/*`).
