---
'agentsmesh': minor
---

**Changed — `init` enables the tools you use, not every tool it supports.** A non-interactive `agentsmesh init` in a repo with no tool config enabled all 32 starter targets, so the next `generate` wrote 47 files and roughly thirty dot-directories into a project that had asked for none of them. That is a poor first impression and a real foot-gun for scripted and CI adoption. Target selection now follows evidence of intent, strongest first: `--targets a,b`, then `--all-targets`, then tool config found in the project, then tools installed on this machine, then a minimal set of `claude-code`, `cursor` and `copilot`. The same empty repo now produces 9 files. Unless you passed a flag, `init` prints how many targets it enabled, which rule chose them, and the flag that changes them.

Machine detection reuses each target's own global detection paths (`~/.claude/`, `~/.cursor/`, `~/.config/zed/`, …), so a new target participates by declaring its descriptor rather than by being added to a list. Nothing is ever imported out of your home directory; the paths only inform which targets to enable. A target that opts out of bulk scaffolding via `excludeFromStarterInit` is never auto-enabled by `--all-targets` or by machine detection, but naming it in `--targets` or committing its config in the project still enables it.

**Added — `agentsmesh init --targets <csv>` and `agentsmesh init --all-targets`.** `--targets` enables exactly the listed IDs and rejects an unknown one instead of silently narrowing the run. `--all-targets` restores the previous full-starter-set behavior in one flag.

**Changed — the interactive wizard pre-selects the same targets** the non-interactive path would have chosen, instead of starting from an empty selection. Both entry points now agree on what a sensible default looks like, and the choice is still entirely the user's to change.
