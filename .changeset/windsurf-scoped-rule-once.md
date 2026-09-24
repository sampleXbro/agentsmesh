---
'agentsmesh': patch
---

Windsurf now gets each scoped rule once. For a rule with `globs: ["src/**/*.ts"]`, `agentsmesh generate` wrote `.windsurf/rules/typescript.md`, an identical `.windsurf/rules/src.md`, and `src/AGENTS.md`, so Windsurf loaded the rule several times, `src/AGENTS.md` applied it to every file in `src/`, and `agentsmesh import --from windsurf` added a duplicate `.agentsmesh/rules/src.md`. Now only `.windsurf/rules/typescript.md` (`trigger: glob`) is written; the next `generate` removes the old `.windsurf/rules/src.md`, and import ignores an old `src/AGENTS.md` that holds the same text as a Windsurf rule, so a generate and import round trip no longer adds rules. You can delete such an old `src/AGENTS.md` if no other tool uses it. A nested `AGENTS.md` you wrote yourself is still imported as a folder rule.
