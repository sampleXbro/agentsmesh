---
'agentsmesh': patch
---

A skill whose `SKILL.md` is a symlink is now skipped, like every other symlinked canonical file. Before, `install`, `generate` and pack loading followed the link and copied the file it pointed to into `.agentsmesh/packs/` and the generated `.claude/skills/` and `.cursor/skills/` folders, so a skills repository could pull a local file into folders that usually get committed. The other skills in the same source are still installed.
