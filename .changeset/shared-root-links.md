---
'agentsmesh': patch
---

`agentsmesh generate` no longer fails when the root rule links to another rule and two enabled targets write the same `AGENTS.md` (for example Codex CLI and Cursor, Codex CLI and Gemini CLI, or Cursor and Windsurf). The shared `AGENTS.md` keeps canonical references so both copies stay the same, but a relative link such as `[TS rule](./typescript.md)` was left unchanged and pointed to nothing, so the broken-link check stopped the run. Now such links point to the canonical file (`.agentsmesh/rules/typescript.md`).
