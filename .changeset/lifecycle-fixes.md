---
'agentsmesh': patch
---

`lessons merge` now keeps an always-on rule always-on, keeps the loser's rationale, and keeps the earlier creation date. Lessons that were merged into a lesson you later merge or deprecate now move with it, so `lessons deprecate` works on any lesson (before, it was refused for every lesson that others had been merged into). Always-on lessons no longer show a "can never be recalled" warning, `lessons untrigger` lets you remove their last trigger, and merge, deprecate and untrigger errors now carry a stable `code`.
