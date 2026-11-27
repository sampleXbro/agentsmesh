---
'agentsmesh': patch
---

`agentsmesh generate` now deletes the generated files of a target you removed from `targets:`, and the folders that became empty. It also does this when the run has nothing to generate. It deletes a file only when nobody has edited it since agentsmesh wrote it. Files you edited, and shared tool configs such as `.cursor/mcp.json`, are kept with a warning. `--dry-run` lists what would go, and `generate --check` fails (exit 1) while such files are still on disk, instead of saying the files are in sync. The summary now counts the removed files (`Generated: 0 created, 0 updated, 3 removed, 13 unchanged`), and `--json` output has `removed` and `kept` lists. A `--targets` run never deletes anything. The MCP `generate` tool reports them too: its result has `removed` and `kept` lists, and one warning for each kept file.
