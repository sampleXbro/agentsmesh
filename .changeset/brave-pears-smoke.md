---
'agentsmesh': patch
---

**Corrected — the comparison table overstated what is unique to AgentsMesh.** Every row was re-verified against each project's own source and documentation on 2026-09-19, and two claims were wrong: rulesync ships a self-serve MCP server and a documented programmatic API with a global `--json` envelope, both of which the table marked as absent or partial. It also credited Ruler and rulesync with tool counts neither project advertises. Those rows are fixed, the counts are now counted from source and labelled as such, and the table says plainly that rulesync supports more tools than AgentsMesh and releases more often.

The rows that survived verification are stated more precisely: cross-file link rewriting (no tool in the category does it), a lossless round-trip across every feature rather than one target's permissions, a lockfile-verified drift gate with git-merge recovery, target plugins, and lessons. "Plugins" is now "target plugins" throughout, because the Agent Plugins specification has since claimed the bare word for a bundle of skills and MCP servers. Two newer adjacent projects, capa and Sentry's dotagents, are named with an accurate description of what they actually do instead of being scored against a grid built for config transpilers.
