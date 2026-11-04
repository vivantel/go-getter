---
id: 0045-operation-status-semantics
title: operation status compares strictly and reads local readings only
status: active
date: 2026-11-04
tags: [outcomes, observability]
kind: decision
governed-by: 0177-each-part-of-the-framework-owns-one-artifact-and-one-kind-of-decision
last-verified: 2026-11-04
---

`go-getter operation status` reports a health meter as crossed only when its latest reading is strictly beyond the threshold: `above` means greater, `below` means less, and equality is not crossed.

It reads the readings already in local refs and does not fetch, so it has no side effect. On another machine, run `go-getter measure series <meter>` first, which fetches.

`operation check` does not verify that a charter's `outcome` names an existing `docs/outcomes/<id>.md`.
