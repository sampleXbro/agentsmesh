---
'agentsmesh': patch
---

Security: AgentsMesh now depends on `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7, and the `express` packages the MCP SDK pulls in are pinned to fixed versions (`proxy-addr` 2.0.8, `body-parser` 2.4.0, `fast-uri` 3.1.9). This clears the high and critical advisories `pnpm audit --prod` reported for these packages, among them GHSA-jqcg-44mw-7w3h, GHSA-46jr-4wx8-v453 and GHSA-mrhx-c7xc-m3w5. `agentsmesh mcp` talks over stdio, so the HTTP transport issues did not reach it directly; `zod` also validates your config files in every command.
