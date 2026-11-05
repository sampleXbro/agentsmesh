---
'agentsmesh': patch
---

The npm package now states its real minimum Node.js version: `engines` asks for Node.js 20.19 or newer (it said 20.0). The CLI already needed it: on Node.js 20.0 to 20.11 it stopped at start-up, and its file watcher `chokidar` 5 asks for 20.19. CI now tests Node.js 20 again, next to 22 and 24. If you run the npm package on Node.js 20, update to 20.19 or newer. Homebrew and the standalone binaries do not need Node.js.
