---
'agentsmesh': patch
---

**Fixed — a token in an install source is no longer written to files you commit.** Installing from `git+https://user:token@host/org/repo.git` recorded the URL verbatim in `installs.yaml`, `pack.yaml` and the install manifest, and used it to name a directory in the remote cache. The credential is now stripped from everything persisted and from cache keys; only the fetch itself sees it, and the same repository resolves to one cache entry whether or not a token was supplied. Authentication for a later `refresh` comes from git's own credential mechanism (a helper, or SSH) rather than from a secret committed alongside the manifest.

**Fixed — `agentsmesh.yaml` keeps its comments.** Adding an extends entry with `install --extends`, or removing one with `uninstall`, rewrote the file by re-serializing a parsed object, which silently discarded every comment and any key this version does not model. Both paths now edit the document in place.

**Fixed — `install --name` will not adopt an extends entry you wrote by hand.** A name already used by an entry pointing at a different source is refused with a message naming that source, because `uninstall` removes the row by name — so adopting it meant your entry disappeared along with the pack. Reusing the name of an earlier install of the same source still works.

**Changed — more skill file types are carried as bytes.** The binary allowlist added Office and design documents (`.xlsx`, `.docx`, `.pptx`, `.psd`, `.ai`, `.sketch`, `.fig`), uncompressed and modern archives (`.tar`, `.zst`, `.br`, `.lz4`), columnar data and model formats (`.parquet`, `.avro`, `.onnx`, `.safetensors`, `.gguf`), and further media and database extensions. A skill shipping a spreadsheet template is no longer corrupted on generate.
