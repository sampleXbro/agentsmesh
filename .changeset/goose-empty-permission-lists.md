---
'agentsmesh': patch
---

`agentsmesh generate --global` now clears a Goose permission list when `~/.agentsmesh/permissions.yaml` has it empty. Before, when every list was empty (`allow: []`, `deny: []`, `ask: []`), the `user` lists in `~/.config/goose/permission.yaml` were left as they were. Lists missing from `permissions.yaml` and Goose's own `smart_approve` entries still stay as they are. The `user` block now always has all three lists (`always_allow`, `ask_before`, `never_allow`), with `[]` for an empty one, because Goose does not start when one of them is missing. Before, AgentsMesh left out empty lists, so a `permissions.yaml` with only an `allow` list could write a file Goose refused to load.
