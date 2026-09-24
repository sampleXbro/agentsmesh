---
'agentsmesh': patch
---

On Windows, agentsmesh now copes when another process is removing or reading the same lock folder or file at that moment. A command waiting for a busy lock (for example `generate`, `install` or a lessons write) no longer crashes with `EPERM`, and lessons recalls running at the same time no longer lose a session dedup entry. Short `EPERM`, `EACCES` and `EBUSY` errors are retried for a moment, as renames already were; an error that does not clear still stops the command.
