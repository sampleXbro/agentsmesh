---
'agentsmesh': patch
---

An installed pack or an extended source can no longer replace your root instructions. Before, a pack rule with `root: true` (under any name other than `_root.md`) silently became the root rule, so `CLAUDE.md`, `AGENTS.md` and Cursor's root rule showed only the pack's text, and `check` still passed. This worked even for remote packs, whose hooks, MCP servers and permissions are stripped as untrusted. Now there is exactly one root rule: your own, else an installed pack's, else an extended source's. Any other `root: true` rule is used as a normal rule, and `generate` prints a warning naming it.
