---
'agentsmesh': patch
---

`agentsmesh generate --global` now clears a Continue permission list when `~/.agentsmesh/permissions.yaml` has it empty. Before, an empty list (`allow: []`, or `deny: []` for Continue's `exclude`) left your own list in `~/.continue/permissions.yaml` as it was, and when every list was empty nothing was written at all. An empty list is now written as `[]` in place of your list. A list missing from `permissions.yaml` still leaves your list in Continue alone, and when every list is empty and you have no `~/.continue/permissions.yaml`, no file is created.
