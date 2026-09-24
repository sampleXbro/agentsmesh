---
'agentsmesh': patch
---

The `agentsmesh lessons` commands handle bad input clearly instead of quietly doing the wrong thing.

A flag that needs a value but gets none now fails with exit 2 and "--flag needs a value". Before, it was ignored: `deprecate X --superseded-by` deprecated without the supersede link, and `query --session` skipped dedup. A value that starts with `--` can be passed as `--flag=value` (for example `--rule="--no-verify is forbidden"`), and the error for an unknown "flag" that is really text says so. `prune --cap abc` no longer falls back to the default cap. `lessons help [subcommand]` works.

`lessons add` uses exit 2 for every input error, with messages that name the flag: `--scope` other than `always`, a topic id that is not kebab-case (it suggests one), `--new-topic` without a non-blank `--topic-summary`, and an unsafe `--trigger-file` glob, which is now refused before any trigger id is made. A change the graph validator refuses also exits 2, and the message is plain: `Refused to save the lessons graph: … Nothing was written.` Internal names such as `mutateLessonsGraph:` no longer show in messages. Repeated `--evidence` refs are stored once. The 2000-character rule limit counts characters, so an emoji counts once.

`--trigger-file` is stored in one form: surrounding spaces and a leading `./` are dropped, so `./src/a.ts` reuses the `src/a.ts` trigger. A relative path that climbs out of the project (`../x.ts`), the project root, or an existing folder is rejected with a clear reason; for a folder it suggests `folder/**`. The same applies to the MCP `lessons_add` tool. A `--trigger-cmd` with a `\u{…}` escape is rejected, as the docs said.

`query` says when a legacy `index.yaml` store could not be migrated, instead of printing only "(no matches)". `import-md --migrated-at` must be a real date. `AGENTSMESH_LESSONS_TELEMETRY` and `AGENTSMESH_LESSONS_OUTCOME_LOG` also accept `true`/`false`, `yes`/`no` and `on`/`off`. `lessons query` warns when `config.json` has a switch that is not `true`/`false` (such as `"outcomeLog": "no"`) or is not a JSON object.

Smaller fixes: `show <lesson>` includes the rationale, `journal` marks deprecated and superseded lessons, `validate --json` names the error codes, messages end with a period, the `--ids` help text says what it does, and the docs keyword example uses one `--trigger-kw` per keyword.
