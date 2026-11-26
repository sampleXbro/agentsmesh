---
'agentsmesh': patch
---

`agentsmesh lessons add` now refuses a file glob that matches every file (such as `**` or `**/*`) with exit code 2 and the code `CATCH_ALL_GLOB`; use `--scope always` for a rule that applies to every task, or a file-class glob like `src/lib/use*Form*.ts`. Adding a rule again with different case, a trailing period, or wrapping quotes now updates the existing lesson instead of creating a near-duplicate. The capture hint after a failed command now names the program that really ran, and skips `VAR=value` words, `sudo`, `env`, `time`, `nice`, `nohup`, `command`, `exec`, and flags, so it no longer suggests triggers like `-d\b` or `\bsudo\b`.
