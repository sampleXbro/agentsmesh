---
'agentsmesh': patch
---

Commands now stop with exit code 2 when you pass a flag they do not accept, and suggest the closest one (for example `--dryrun` now says "Did you mean --dry-run?" instead of running a real `generate`). With `--json`, the same error comes back as a failure envelope. A config error now names the wrong key (`targets[1]: …`, `features: …`) in `agentsmesh.yaml` and `agentsmesh.local.yaml`, and no longer prints the full list of target ids.
