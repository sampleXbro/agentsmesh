---
'agentsmesh': minor
---

A list missing from `.agentsmesh/permissions.yaml` is now unmanaged: `generate` leaves the tool's own list alone instead of writing it empty. Before, uncommenting only `allow` in the `init` template made `generate` write `deny: []` and `ask: []` over your own lists in `.claude/settings.json` and in other tools' permission files.

Each list is now managed on its own:

- A list in the file, even `[]`, is managed. `generate` writes it to each tool in place of the tool's own list; a few tools skip an empty list instead of writing it, so their own list stays (the permissions docs explain this).
- A missing or commented-out list, or a key with no list under it (`deny:`), is unmanaged. Each tool keeps its own list.
- A file with no list at all (empty, or the commented-out `init` template) manages nothing, the same as no file.

Other changes:

- Cursor and Qwen Code now merge inside `permissions`, so unmanaged lists and other keys there stay. They write a managed empty list as `[]`.
- Deleting `permissions.yaml` or one of its lists no longer clears that list in Pi, Antigravity, Kimi Code or Kiro. To clear a list, keep it and make it empty (`deny: []`).
- Kimi Code and Kiro (`~/.kiro/settings/permissions.yaml`) keep your own rules for a list that `permissions.yaml` does not manage.
- The MCP `update_permissions` tool writes only the lists you pass.
- `schemas/permissions.json` no longer gives the lists a `[]` default, and accepts a key with no list (`deny:`).
- Import no longer starts managing a list the tool does not have. Before, importers wrote every list, so `agentsmesh import --from pi-agent` (Pi has no deny list) wrote `deny: []`, and the next `generate` cleared the deny list in `.claude/settings.json` and every other tool. Now an empty list an import writes is dropped unless `permissions.yaml` already managed that list, and a list it already managed, even `[]`, stays managed. This holds for `import`, `init --yes`, the `importFrom()` API, the MCP `import` tool, plugin targets and `agentsmesh convert`.
- Augment Code, Kilo Code, Rovo Dev, Zed and Junie still rebuild their single permissions structure, so their own entries for an unmanaged list can be lost. The permissions docs explain this.

**Upgrade note:** files written by 0.42 and earlier may hold empty lists you never chose, because older imports always wrote all three lists. These now count as managed, so `generate` still clears those lists in your tools. Delete any empty list you do not want to manage from `.agentsmesh/permissions.yaml` (and `~/.agentsmesh/permissions.yaml` for `--global`) before you run `generate`. A file where every list is empty (`allow: []`, `deny: []`, `ask: []`) is now applied by Cursor, Qwen Code and Pi too, where 0.42 skipped it: Cursor and Qwen Code empty their lists, and Pi gets `defaultTools: []`, which turns off its built-in tools (`agentsmesh lint` warns about this).

**For plugin authors and API users:** `Permissions.allow` and `Permissions.deny` are now optional, like `ask`. A missing list means "leave the tool's value alone", not "empty".
