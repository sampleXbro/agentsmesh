---
'agentsmesh': patch
---

`agentsmesh generate` no longer prints the same config warning twice. The support matrix it prints at the end loaded the config a second time, so warnings from loading it (for example a demoted `root: true` rule from a pack, or settings skipped from packs and `extends`) appeared once for the run and again for the matrix. The matrix now reuses the config `generate` already loaded.
