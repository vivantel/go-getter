---
id: 0092-pack-rendered-drafts-count-as-adopted
title: update and reconfigure treat pack-rendered artifacts that are still draft as adopted
status: draft
date: 2026-10-09
tags: [generated-files, configuration]
track: process
governed-facts: [0033-apply-keeps-no-record-of-what-it-wrote]
---

## Decision

Draft, from the work on go-getter update (plan `manifest-update-remove`, step 6). A pack-rendered artifact (`go-getter.generated-by`) with `status: draft` or `active` is adopted. `update` and `reconfigure` keep its decision for an unchanged answer and re-render the rest from it; they do not render a second decision beside it.

## Why

Decision 0091 keeps a decision draft until it is accepted or adopted. Counting only `active` artifacts made `update` render a duplicate of a draft decision whose answer had not changed (here 0076-watcher-noise became 0092-watcher-noise, and the guardrail was re-pointed at the copy).
