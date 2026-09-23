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
