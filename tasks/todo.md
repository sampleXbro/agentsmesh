# Hero: hub-and-spoke scene after the banner (2026-09-06) — UNCOMMITTED by request

Reference: assets/agentsmesh-banner.jpeg. The mark in a disc at the centre, a
lessons ring with `recall` on top and `capture` below, tool cards with logos
on either side (compact: beneath), dashed brand-coloured connectors, a
"Lessons Subsystem" chip, "and more".

- [x] hub-layout.mjs: arcs, ring, connectors, wide/compact geometry (5 tests)
- [x] tool-icons.mjs: simple-icons for Claude, Cursor, Copilot, Gemini, Windsurf;
      terminal glyph for Codex (OpenAI mark not in that set)
- [x] HubScene.astro: drawn mark, ring + arrowheads, circulating token, pills
      that light as it passes, dashed drift on connectors; static mode
- [x] Hero + og wired; FlowDemo + flow-timeline removed; simple-icons devDep
- [x] verified on the production build: 1100 dark + light, 768, 375; OG re-rendered
- [x] commit

# Critical bug audit (2026-09-07) — do not commit

- [x] Review generation, install, shared locks, and MCP writes for serious bugs.
- [x] Reproduce pack sibling deletion and generation symlink escapes with failing tests.
- [x] Fix both bugs; focused regression tests pass, including plugin targets and convert.
- [x] Build and TypeScript pass; ESLint has no errors (one existing warning).
- [x] Full suite: 1,108 files passed; 12,667 tests passed, one skipped. Website build and links pass.
- [x] Review final diff and capture lessons for pack ownership, path containment, and test isolation.

# Deeper bug audit (2026-09-07) — do not commit

- [x] Review concurrency, error recovery, and MCP/config mutation flows.
- [x] Reproduce and fix atomic-file collisions, stale-lock recovery, Claude empty-setting revocation, lossy MCP updates, and partial invalid skill updates.
- [x] Verify fixes: 1,115 test files passed; 12,698 tests passed, one skipped. Build, TypeScript, formatting, website build and links pass; ESLint has no errors and one existing warning.
- [x] Review the complete diff and capture six reusable lessons. No commits.
- [x] Restore the generated E2E report timestamp after approval review succeeded on retry.
