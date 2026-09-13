---
'agentsmesh': patch
---

Bumped the `smol-toml` production dependency to 1.8.0, clearing GHSA-7w5x-hrqm-74c2 (high) which affects every version up to 1.7.0. `smol-toml` parses `.codex/config.toml`, so the advisory shipped to anyone installing agentsmesh.
