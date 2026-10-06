---
id: 0085-pack-questions-added-later-declare-since
title: A pack question added in a later version declares `since` and falls back to its default or recommended option
status: draft
date: 2026-10-06
tags: [practice-packs, interview, configuration]
track: process
---

## Decision

Extends 0022 and 0026. A question added after a pack's first version carries `since: "<version>"` (no later than the pack version); a text or list one also needs a `default`. When an answer file omits it, `render-pack` and `reconfigure` use its default or recommended option, so answer files written for an older pack version still render.

## Why

Pack versions add questions (verification-gate 0.2.0, decision 0071); without a fallback every existing answer file fails with "no answer for question".

## Tradeoffs considered

- **Treat every missing answer as the recommended option**: no new field, but hides typos and missing answers in new answer files.
- **Versioned answer files with migrations**: exact, but heavy for additive changes.
