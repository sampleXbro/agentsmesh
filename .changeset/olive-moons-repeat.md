---
'agentsmesh': minor
---

**Changed — the generation-contract block is 56% shorter.** The managed block agentsmesh injects into every target's root instruction ran to 85 words, enumerating every canonical filename (`rules/_root.md`, `commands/*.md`, `skills/*/SKILL.md`, …) and most of the CLI surface (`init`, `import`, `install`, `diff`, `lint`, `check`, `watch`, `matrix`, `merge`, `refresh`). That text is projected into `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, `.github/copilot-instructions.md` and every other root file, so every agent in every tool re-read all of it on every turn — a cost paid per session, per tool, per developer.

It now carries only the part an agent cannot infer for itself: generated files are not the source, edit `.agentsmesh` (or `agentsmesh.yaml` for targets and features), then run `agentsmesh generate`. Canonical filenames are discoverable by listing the directory, and the command surface by `--help`.

The previous wording joins the legacy ladder, so an existing root file is upgraded in place on the next `generate` and stripped correctly on import — no duplicate contract blocks and no stale text left behind.
