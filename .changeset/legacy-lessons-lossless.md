---
'agentsmesh': patch
---

The one-time migration of the old lessons store (`index.yaml` + `topics/*.md` + `journal.md`, used up to 0.22) no longer loses lessons. Before, it kept only single-line numbered rules under a `## Rules` heading, dropped bullet rules, rules under other headings and the rest of wrapped rules, never read `journal.md`, and then deleted all the old files, even when started silently by the recall hook. Now every list item under a `## Rules` or `## Lessons` heading becomes a lesson, numbered or bullet, with the lines that wrap onto it, and rules with the same number in two sections are both kept. If a topic file has a list item under any other heading, the migration stops, names the file and line, and changes nothing. `journal.md` is kept for you to review, and the recall hook never migrates: the first `lessons` command you run does, and says so.
