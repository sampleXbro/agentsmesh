---
'agentsmesh': patch
---

Claude Code rules keep their file scope. Claude Code scopes a rule in `.claude/rules/*.md` with `paths:`, the only field it reads from a rule. `agentsmesh import --from claude-code` ignored `paths` (the canonical rule got `globs: []`), and `agentsmesh generate` wrote a canonical rule's `globs` as `globs:`, which Claude Code ignores, so scoped rules applied to every file. Now import reads `paths` (a YAML list or a comma-separated string) into `globs`, older generated files with `globs:` still import, and generate writes `paths:`.
