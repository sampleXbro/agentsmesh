---
'agentsmesh': patch
---

On Windows, a command waiting for a busy agentsmesh lock (for example `generate`, `install` or a lessons write) no longer crashes with `EPERM` when another process frees a stale lock at the same moment. It now retries for a short time, as it already did for renames; an error that does not clear still stops the command.
