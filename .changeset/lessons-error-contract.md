---
'agentsmesh': minor
---

A failed `agentsmesh lessons ... --json` command now has a stable `code` field (for example `UNKNOWN_TOPIC` or `UNRECALLABLE_LESSON`) next to `error`, and `lessons strip-markers` now reports a failed write with the same exit codes as the other write commands. The `agentsmesh/lessons` entry now exports the capture error classes, `LessonsWriteRefusedError`, `isCaptureRejection` and a `LessonsErrorCode` type. The MCP tool `lessons_query` now returns a `warning` when the lessons graph cannot be read, so an empty result is no longer mistaken for "no match".
