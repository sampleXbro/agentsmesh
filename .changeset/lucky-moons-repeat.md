---
'agentsmesh': patch
---

**Fixed — a slash command in prose is no longer rewritten as a path.** `/plugin`, `/config`, `/memory` and friends are indistinguishable from a one-segment root-absolute path, and reference resolution is existence-gated, so the corruption appeared only once a repository grew a directory of that name: a repo with `plugin/` saw every `/plugin` in its skills and rules silently rewritten to `plugin` on the next `generate`. Directory names like `config`, `docs`, `test` and `build` make this likely in an ordinary project, and agent-facing documentation is full of slash commands.

A root-absolute token now has to look like a path to be treated as one — a further segment, a file extension, or a trailing slash. `/docs/x.md`, `/AGENTS.md` and `/docs/` still rewrite; `/docs` is left alone. Write `/docs/` or `docs/` when you mean the directory.
