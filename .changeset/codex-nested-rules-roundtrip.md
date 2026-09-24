---
'agentsmesh': patch
---

Importing generated Codex CLI or Codebuff output back no longer adds duplicate rules. A scoped rule, for example `globs: ["src/**/*.ts"]`, is written to a nested `src/AGENTS.md`. `agentsmesh import --from codex-cli` (or `codebuff` or `windsurf`) read that file as a new rule `.agentsmesh/rules/src.md`, and each import and generate cycle then repeated the rule text in `src/AGENTS.md` and copied it to every other target. Now each rule in a nested `AGENTS.md` is written as an `agentsmesh:embedded-rule` entry that names its canonical source, so import restores the original rule (with its globs and Codex instruction variant) and only hand-written text becomes a directory rule. If an earlier cycle already created such a rule, such as `.agentsmesh/rules/src.md`, delete it once.
