---
'agentsmesh': patch
---

AgentsMesh can now be listed in the official MCP registry. The published package declares `mcpName`, the field the registry reads to confirm that the npm package and the registry entry share an owner — without it a submission is rejected outright. The registry manifest `server.json` also stops pinning an npm version, so it can no longer advertise a release that has been superseded, and its remaining version field is written by `changeset version` instead of by hand.
