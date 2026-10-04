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
      check: "GitHub secret scanning with push protection is on; .gitignore excludes .env, .env.* and .go-getter/state/"
      run: "gh api repos/vivantel/go-getter --jq .security_and_analysis"
---

## Guardrail

Never commit credentials, tokens, `.env` files, telemetry state, or non-public information. A leaked secret must be rotated; deleting the commit is not enough.
