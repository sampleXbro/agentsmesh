---
'agentsmesh': patch
---

`install` (including `install --sync` and `refresh`) and `uninstall` now refuse a `.agentsmesh/packs` folder, or a single pack folder, that resolves outside the project, for example through a symlink committed to the repository. Before, they followed the link and could write, replace or delete a folder outside the project. The check runs before anything is read or written, also under `--dry-run`, and the error names where the path really points. The MCP `install` and `uninstall` tools get the same protection.

Lessons get the same protection: when `.agentsmesh/lessons` (or `.agentsmesh`) resolves outside the project, `lessons add` and every other lessons write, `init --lessons` and the MCP lessons tools refuse with a clear error instead of writing `lessons.json`, its lock or its logs there. The recall hook keeps working and simply skips its logs. A link to a folder inside the project still works.
