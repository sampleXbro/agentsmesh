---
'agentsmesh': patch
---

`lessons add` run from a subfolder now reads a relative `--trigger-file` from that folder when the path does not exist from the project root, saves it project-relative, and says when it moved the glob. A catch-all file glob is now also refused when another lesson already holds it, and a failed `cd` no longer suggests a `\bcd\b` command trigger. The MCP tool `lessons_query` now returns a `warning` when a legacy lessons store could not be migrated, and `agentsmesh/lessons` also exports `CatchAllGlobError`, the curation errors (`UnknownLessonError`, `SelfMergeError` and the rest) and the `RecallHookOutcome` and `ScaffoldLessonsOptions` types.
