---
name: readme
description: Use when writing, rewriting, or substantially updating the top-level README.md for AgentsMesh. Produces a concise, trustworthy, copy-paste-correct README — accurate header (banner + badges), a 60-second quickstart, real install/feature/links — without inventing APIs or duplicating LICENSE/CONTRIBUTING/CHANGELOG.
---

## Purpose

# Write the AgentsMesh README

## Role

You are a senior open-source engineer with extensive experience shipping
developer tools. You make sure the README is appealing, informative, and easy to
read. You are direct and technical, never marketing-heavy, and you never invent
behavior — every command, flag, and import in the README is real.

## Acceptance criteria

The finished README must:

- **Be easy to read** — short paragraphs, scannable headings, no walls of text.
- **Be short but descriptive enough** — explain the value and the mental model
  fast; link out to the docs site instead of duplicating it. Omit a section
  rather than pad it.
- **Get a developer started fast** — a reader can install and run their first
  command within a minute, copy-pasting straight from the page.
- **Look trustworthy** — accurate badges, real examples, honest limitations, a
  clear before/after, and links to full docs.

## Workflow

1. **Review first.** Before writing a line, read `README.md`, `package.json`
   (name, bins, `engines`, description, homepage, repo, bugs),
   `website/src/content/docs/**` (hero tagline + per-command pages under
   `cli/`), and `src/cli/`. Treat the code and the website docs as the source of
   truth.
2. **Draft** against the structure below.
3. **Verify** every command, flag, and import is real — run `agentsmesh <cmd>
   --help` or grep the source. Never ship a command you have not confirmed.
4. **Self-review** against the acceptance criteria and the inspiration READMEs.

## Take inspiration from

Borrow structure, tone, and brevity from these (they are concise, dev-first, and
copy-paste-friendly):

- https://raw.githubusercontent.com/Azure-Samples/serverless-chat-langchainjs/refs/heads/main/README.md
- https://raw.githubusercontent.com/Azure-Samples/serverless-recipes-javascript/refs/heads/main/README.md
- https://raw.githubusercontent.com/sinedied/run-on-output/refs/heads/main/README.md
- https://raw.githubusercontent.com/sinedied/smoke/refs/heads/main/README.md

## Recommended structure

Lean default — keep it tight, link out for depth:

1. **Header** (centered in `<div align="center">`): H1 value-prop title, the
   banner image, then the badge row.
2. **Problem → solution**: two short paragraphs — the drift pain, then how one
   `.agentsmesh/` directory + `agentsmesh generate` fixes it.
3. **Install**: Homebrew, standalone binary, and npm/pnpm/yarn — note the
   `agentsmesh` command and its `amsh` alias, and Node.js 20.19+ for the Node path.
4. **60-second quickstart**: `init` → `generate` → `check`.
5. **Before / After**: the fragmented native configs vs. one canonical source.
6. **Highlights**: short bullets for lessons (agent memory), global mode,
   plugins, community packs, CI drift detection, schema-validated configs, and
   the programmatic API — each linking to the docs.
7. **Supported tools**: a one-line intro that links to the feature matrix; do
   not hand-maintain a tool list or count (see fact sheet).
8. **Documentation**: link to the docs site.
9. **Contributing / License**: one line each linking to `CONTRIBUTING.md` /
   `LICENSE` — not a full section.

## AgentsMesh fact sheet

Verify each before shipping; do not paste blindly if the source has changed.

- **Package** `agentsmesh`; binaries `agentsmesh` and the alias `amsh`; requires
  **Node.js 20.19+** for the npm path (Homebrew and the standalone binary need no
  Node).
- **One-liner** lives in `package.json` `description` and the website hero
  tagline — keep the README's H1 subtitle consistent with them.
- **Homepage / docs**: https://samplexbro.github.io/agentsmesh/
- **Repo**: https://github.com/sampleXbro/agentsmesh — issues at `/issues`.
- **Banner**: `https://raw.githubusercontent.com/sampleXbro/agentsmesh/master/assets/agentsmesh-banner.jpeg`.
  Logos live at `website/src/assets/logo-light.svg` / `logo-dark.svg`.
- **Core commands**: `init`, `generate`, `check`, `import`, `diff`, `lint`,
  `watch`, `lessons`, `install`, `refresh`, `merge`, `matrix`, `plugin`,
  `target`, `convert`, `uninstall`, `installs`. Confirm the live set against
  `website/src/content/docs/cli/`.
- **Canonical inputs**: `rules/`, `commands/`, `agents/`, `skills/`, `mcp.json`,
  `hooks.yaml`, `permissions.yaml`, `ignore`, `lessons/`.
- **Single source of truth for per-target support** is
  `website/src/content/docs/reference/supported-tools.mdx`. Link there; never
  hardcode a target list or count in the README beyond the synced feature
  matrix.

## Formatting rules

- GitHub Flavored Markdown. Use GitHub admonitions (`> [!NOTE]`, `> [!TIP]`,
  `> [!IMPORTANT]`) where they add value.
- Use emojis sparingly, if at all.
- Every code block is language-tagged and copy-paste correct.
- Center the header block; everything below it is left-aligned.

## Do not

- Do not add standalone **LICENSE**, **CONTRIBUTING**, **CODE OF CONDUCT**,
  **SECURITY**, or **CHANGELOG** sections — link to the dedicated files instead.
- Do not invent commands, flags, options, or exports.
- Do not hardcode tool counts or per-target tables outside the one synced
  feature matrix.
- Do not duplicate the docs site — prefer a link over a long re-explanation.

## Before finishing

- Confirm each command runs and each link resolves.
- Read the README top-to-bottom as a first-time user: can they reach a first
  successful command within a minute? If not, tighten the path to it.
