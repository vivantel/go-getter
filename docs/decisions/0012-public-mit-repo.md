---
id: 0012-public-mit-repo
title: The repo is public on GitHub as vivantel/go-getter under the MIT license
status: active
date: 2026-10-04
tags: [licensing, packaging, security]
track: process
accepted-by: sergemso
---

## Decision

The repository is `github.com/vivantel/go-getter`, public from creation, licensed MIT with copyright holder `vivantel` (as in kms). Everything committed, including this knowledge base and plans, is world-visible from the first push.

## Why

Plugin marketplaces install from public repos with no auth, which "minimal effort setup" needs; MIT matches kms, so the vendored kms pack (0006) shares the license.

## Tradeoffs considered

- **Private until v0.1**: safer for early mess, but installs need GitHub auth meanwhile and the flip must not be forgotten.
- **Apache-2.0**: patent grant, but differs from kms's license.
