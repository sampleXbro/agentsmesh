---
'agentsmesh': patch
---

**Fixed — `--json` output is complete when you pipe it.** Node writes to a pipe asynchronously, and `process.exit` discards whatever is still queued, so any envelope larger than the pipe buffer reached the consumer as an unparseable fragment: `agentsmesh diff --json | jq` received 64 KiB of a 7 MB document, while the same command redirected to a file was whole. Redirect and pipe now agree at any payload size. Human-readable output on a failing command is covered by the same change.

**Fixed — seeding the self-serve MCP entry no longer costs you the rest of `mcp.json`.** `init` and `import` add an `agentsmesh` server entry to `.agentsmesh/mcp.json`; that write went through the canonical parser, which models only the fields AgentsMesh itself uses. Every other top-level key and every per-server field it does not model — `cwd`, `disabled`, `timeout` — was dropped on the way back out, and a file that failed to parse was replaced by a document containing nothing but the new entry. The write now patches the raw document, so unknown keys survive verbatim. A file that cannot be rewritten safely (invalid JSON, or JSON with comments a rewrite would discard) is left untouched with a warning naming the reason, matching how the generated-output mergers already treat a file they cannot parse.
