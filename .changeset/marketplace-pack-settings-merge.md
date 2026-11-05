---
'agentsmesh': patch
---

`agentsmesh install <source> --all` now keeps the MCP servers, permissions, hooks and ignore patterns of every sub-pack of a marketplace. Sub-packs from one source that ship the same features go into one pack, and each later sub-pack used to replace that pack's `mcp.json`, `permissions.yaml`, `hooks.yaml` and `ignore`, so only the last sub-pack's settings reached your tools (rules from every sub-pack stayed). They now add up, the same way packs merge at `generate`: a later sub-pack's MCP server wins over one with the same name, and lists and hooks are combined without duplicates. The same goes for `install --sync`, and for any install that merges a picked subset into an existing pack.

`agentsmesh refresh` of such a marketplace pack now works. It used to install every sub-pack as a new pack named after the old one (for example `org-repo-plugins-alpha-plugins-beta`), leave the old pack behind, and report the refresh as failed. It now rebuilds the same pack from each recorded sub-pack folder, like `install --sync`, keeping every sub-pack's content and settings and dropping what the source removed.
