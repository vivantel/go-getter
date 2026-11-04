---
id: draft-k8-the-workers-file
title: docs/workers.md lists every worker and is changed by a human only
status: active
date: 2026-11-04
tags: [coordination, security]
kind: decision
governed-by: 0171-grants-only-narrow-down-the-delegation-tree
last-verified: 2026-11-04
---

`docs/workers.md` has one table row per worker: `id`, `tracker` (the login on the issue tracker, `-` for none), `kind` (`human`, `agent` or `ci`) and `tags` (capability tags, comma separated). Readers take the first table whose header has `id` and `kind`; a row with another kind is skipped.

A root grant (a grant on a unit with no parent grant) is valid only when its issuer has kind `human` here and authored the commit that wrote it (decision 0171 item 6). The check is advisory: an agent that pushes with a human's credentials passes it.

The file is human-owned. `go-getter apply` writes `.github/CODEOWNERS` with the tracker login of each human row so a change needs that review, and `ship` refuses to stage a change to it unless the caller is a worker of kind `human`. It is not on the restricted-paths list, because those paths must never be committed.
