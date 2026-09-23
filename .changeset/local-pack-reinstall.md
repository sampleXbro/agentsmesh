---
'agentsmesh': patch
---

Installing a changed pack again now updates it in place. Before, if the source dropped a folder (say `commands/`), running `agentsmesh install` again with the same `--name` failed with "Auto-generated pack name … collides", and without `--name` it added a second pack from the same source that kept the removed files. Now the install finds the pack from the same source, `--target` and `--as` (by `--name`, by feature set, or the one pack that covers the whole source). When both cover the whole source, it replaces the pack's contents like `refresh`, so files removed at the source go away. A picked subset still merges, and packs split by `--path`, `--as` or pick stay separate. A re-install without `--name` also keeps the pack's name (it used to rename a local pack to an auto-generated name), and `--dry-run` shows the pack it would update. A `--name` that belongs to a pack from another source now fails with a clear message that names the pack.

Skill folders are no longer dropped because of their name. A source with `rules/` next to `skills/my_skill/` or `skills/S1/` used to look like a lone rules folder, so its skills, README and LICENSE were skipped without a word. Any skill folder name now counts, except names that start with `.` or `_`.

`mcp.json`, `hooks.yaml`, `permissions.yaml` and `ignore` at the root of a source without `.agentsmesh/` are still not installed (settings install only from a source's `.agentsmesh/` folder), but install now prints one warning that names each skipped file.
