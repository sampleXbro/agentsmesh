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
