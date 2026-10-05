---
id: 0016-pack-option-provenance-field
title: Pack-emitted artifacts also record the chosen option
status: active
date: 2026-10-05
tags: [practice-packs, configuration]
kind: decision
governed-by: 0022-pack-schema-and-enforcement-run-grammar
---

Besides `go-getter.generated-by` and `go-getter.pack-answer` (0022), rendered artifacts carry `go-getter.pack-option` (the option id, or a list for multi-answer questions). `reconfigure` needs it to recover a project's current answers.
