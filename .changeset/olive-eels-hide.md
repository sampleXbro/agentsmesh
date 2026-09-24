---
'agentsmesh': patch
---

Internal-only: removed dead code and collapsed duplicated generators. Two exported helpers had no caller outside their own tests since the commit that introduced them, and one install helper was fully superseded by a more general sibling. Fifteen targets each carried the same four-line ignore generator differing only in a path constant, and the pack writer and merger each repeated the same copy-into-subdirectory loop three times; both now call one shared helper. No behaviour changes: every generated artifact is byte-identical.
