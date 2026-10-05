---
id: no-secrets-in-public-repo
title: No credentials or non-public information may be committed
status: active
date: 2026-10-04
tags: [security, licensing, guardrail]
governed-by: 0012-public-mit-repo
grounded-in: [0012-public-mit-repo]
derivation-note: Given a public repo (0012), anything committed, including history, is world-readable, so secrets and private data must never enter it.
go-getter:
  enforcement:
    - tier: 3
      check: ".gitignore excludes .env, .env.* and .go-getter/state/"
      run: "builtin:gitignore-includes patterns=.env,.env.*,.go-getter/state/"
    - tier: 3
      check: "No tracked file is an env file or key material"
      run: "builtin:deny-path paths=.env,.env.*,*.pem,*.key,id_rsa,id_ed25519"
---

## Guardrail

Never commit credentials, tokens, `.env` files, telemetry state, or non-public information. GitHub secret scanning with push protection is enabled on the repository as a platform backstop. A leaked secret must be rotated; deleting the commit is not enough.
