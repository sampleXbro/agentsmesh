---
'agentsmesh': patch
---

The MCP `create_*` and `update_*` tools for rules, commands and skills now store the body exactly as sent. Before, with empty `frontmatter`, a body that started with a `---` block was saved so that the block became the file's frontmatter. `get_*` then returned different metadata, and body text could set fields such as `root: true`, `allowed-tools` or `name` for `generate`. Now an empty frontmatter block is written before such a body, and the MCP server reads files with the same frontmatter rules as the canonical loader.
