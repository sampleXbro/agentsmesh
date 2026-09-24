# Contributing to AgentsMesh

## Prerequisites

- Node.js 20 or later (CI verifies 22 and 24)
- pnpm 10 — CI pins this version; newer pnpm majors can trip `--frozen-lockfile` on the committed lockfile

## Setup

```bash
git clone https://github.com/sampleXbro/agentsmesh.git
cd agentsmesh
pnpm install
```

## Development workflow

```bash
pnpm build          # compile src/ → dist/
pnpm test           # unit + integration tests
pnpm test:e2e       # end-to-end tests (self-builds first)
pnpm test:coverage  # coverage report: 95% aggregate + per-file floor (scripts/coverage-floor.ts), enforced in CI
pnpm lint           # ESLint
pnpm lint:dead      # knip — unused files / exports / deps
pnpm typecheck      # tsc --noEmit
pnpm typecheck:tests  # type-check tests too (tsconfig.tests.json; listed files are known debt)
pnpm format         # prettier --write
pnpm changeset      # record a user-facing change (see Changesets)
```

`git commit` runs the husky pre-commit gate (`pnpm precommit` = typecheck → dead-code → coverage → lint-staged → build), so a commit takes a couple of minutes and fails on any red gate. Always run `pnpm build` before `pnpm test:e2e` — e2e tests execute `dist/cli.js` directly.

## Rules

- **TDD mandatory**: write a failing test first, then implement.
- **Max file size**: 200 lines. Split by responsibility if larger.
- **No `any`**: use `unknown` + narrowing. Explicit return types on public functions; prefer `interface` over `type` for object shapes.
- **No classes unless stateful**: prefer pure functions + types.
- **Never edit generated files.** `.agentsmesh/` is the source of truth; `.claude/`, `.cursor/`, `AGENTS.md`, `.github/copilot-instructions.md`, and the other per-tool outputs are produced by `agentsmesh generate` and will be overwritten. Change `.agentsmesh/` and regenerate — `agentsmesh generate --check` must report in sync before you commit.
- **Docs stay current.** Any change to CLI commands, flags, config schema, or supported targets must update `README.md` and the website docs (`website/src/content/docs/`). Per-target support lives only in `reference/supported-tools.mdx`; other pages link to it.
- **Strict artifact tests.** Generated-output tests assert exact paths and counts — no `some(...)`, prefix, or "at least one" checks.
- Commits must follow [Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|test|refactor|docs|chore(scope): message`.

## Adding a new target

Use the `add-agent-target` skill documented in `.claude/skills/add-agent-target/`. It requires:

- Current official documentation research for the target format
- Full importer and generator implementation
- Realistic fixtures
- Complete unit, integration, and e2e coverage
- Matrix and docs updates

For **global mode** (`--global` / `.agentsmesh`) on an existing target, use the `add-global-mode-target` skill instead.

## Changesets

Releases are **changesets-driven** — every user-facing change ships a changeset.

- Add a changeset when you touch the **published surface**: `src/`, `schemas/`, `package.json` (deps/exports), or `README.md`. Changes confined to `tests/`, `website/`, `docs/`, or `.agentsmesh/` ship nothing and need **no** changeset.
- Run `pnpm changeset`, choose the bump (`patch` fix / `minor` additive / `major` breaking), and write a one-paragraph, user-facing summary — it becomes the `CHANGELOG.md` entry, so describe the capability, not the commit.
- Commit the changeset alongside the code it describes (no orphan changesets, no orphan code).
- **Never** hand-edit `package.json` `version` or `CHANGELOG.md` — the automated "chore: version packages" PR generates both on merge to `master`.

## Pull requests

- Keep PRs small and focused on one change.
- All CI gates must pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:contract`, `pnpm matrix:verify`, `pnpm test:coverage`, and `pnpm audit --prod`.
- Include a changeset for any published-surface change (see [Changesets](#changesets)).

## Reporting bugs

Open a GitHub issue with a minimal reproduction case. See [SECURITY.md](SECURITY.md) for security vulnerabilities.

## Updating target capabilities

Capability provenance lives in `src/targets/catalog/capability-ledger.json` — an _oracle_ that validates descriptors; it never generates. Current capability levels always come from each target's `capabilities.ts` (the matrix derives from there); the ledger records where the tool's own docs say each file/shape is, so generated output can be validated against it.

Maintainer commands:

- `pnpm capabilities:audit` — join descriptors × ledger and print three buckets: **GAPS** (descriptor below the researched ceiling — raise-opportunities), **STALE** (provenance null/expired, or descriptor over-declares), **MISSING** (a native/embedded cell with no ledger provenance yet).
- `pnpm capabilities:audit --json` / `--stale <days>` — machine-readable output / override the staleness window (default 180).
- `pnpm capabilities:merge` — rebuild the ledger from all builtin target descriptors while **preserving existing provenance**. For confirmed/rejected cells the researched `maxAchievable` ceiling is kept even when the descriptor level is lower; for unverified cells the higher of the descriptor and existing level is used. Existing fingerprints (topLevelKeys, requiredFrontmatter, keyChecks) are preserved when any array is non-empty. Run this after adding a new target or changing capability levels en-masse; commit the resulting diff to `src/targets/catalog/capability-ledger.json`. The merge logic lives in `src/core/capabilities/merge.ts` (pure, unit-tested).
- `pnpm capabilities:seed` — regenerate fingerprint skeletons from current generator output (run after adding or changing a native/embedded feature). Seeds only project-scope, single-structured-file cells; directory/projection features (commands/agents/skills) and extensionless ignore files are left for manual research.
- `pnpm capabilities:verify` — reports native/embedded cells that still lack ledger provenance. This is a **backlog tracker**, not a CI gate: many cells are intentionally un-researched, so it currently exits non-zero.

The enforced gate is the conformance test in `tests/contract/capability-ledger-conformance.test.ts` (runs under `pnpm test`, hence in CI): every seeded native/embedded cell is generated and its output must match the recorded extension, serialization, and structural fingerprint. A declared-native cell whose output drifts (wrong path/key/shape/extension) fails CI.

Use the `update-target-capabilities` skill to drive research on the flagged STALE/MISSING cells and to flip GAPS.
