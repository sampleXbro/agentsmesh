---
'agentsmesh': patch
---

Windsurf rules with a single glob now activate. Windsurf reads a rule's scope from `globs:` (one string, several patterns joined by commas), but `agentsmesh generate` wrote a single pattern as `glob:`, which Windsurf ignores, and several patterns as a YAML list. Now every scoped rule in `.windsurf/rules/*.md` gets `globs: <pattern>` or `globs: <a>,<b>`. `agentsmesh import --from windsurf` also got sturdier: it reads `globs` as a string or a list and still reads the older `glob:`, keeps a brace pattern like `src/**/*.{ts,tsx}` whole, accepts the unquoted form from Windsurf's docs (`globs: **/*.test.ts`), which used to stop the whole import with a YAML error, and skips a rule it still cannot read with a warning instead of failing.
