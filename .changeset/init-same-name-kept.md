---
'agentsmesh': patch
---

`agentsmesh init --yes` no longer loses a rule, command or agent when two tools have one with the same name. Before, the later tool's file replaced the earlier one in `.agentsmesh/`, with the earlier file's frontmatter mixed in, and the next `generate` wrote that text over the first tool's own file. Now, if both texts are the same, one canonical file is kept. If they differ, the first tool's file keeps its name, and the later tool's version is saved as `<name>-<tool>.md` (for example `.agentsmesh/rules/typescript-cursor.md`), each with only its own frontmatter. Init prints a warning for each copy, and `init --json` lists them in `sameNameCopies`. The interactive wizard works the same way. Separate `agentsmesh import --from` runs stay last-import-wins.
