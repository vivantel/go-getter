---
id: 0040-oct-31-throughput-baseline-and-friction
title: Oct 31 throughput baseline and where the owner's time went
status: active
date: 2026-11-01
tags: [roadmap, dogfooding, cost]
kind: environmental
last-verified: 2026-11-01
---

Measured 2026-11-01 from local transcripts and `gh pr list`.

- **Transcripts:** only 5 survive (Oct 31), about 3.7 h active in 6.5 h wall clock. The owner's stated ~20 h is not verifiable from them.
- **Output Oct 31:** 5 merged PRs (#231, #238, #239, #240, #241; two are releases), +2.2k/-0.16k lines, 88 files, plus plans, decisions and facts. Estimated conventional effort about 45 man-hours (range 30-70); an estimate, not a measurement.
- **Repo history:** first commit 2026-10-04; about 84k lines added; 140 commits on Oct 9-12, almost none after Oct 16.
- **PR cycle:** about 22-31 min from open to merge, serial; each release is its own PR.
- **Friction:** (1) owner as relay: turns like "2", "y", "whats next", "merge, watch, release"; (2) the owner objected three times that routine work was done by hand in shell, not by go-getter verbs; (3) a host permission classifier blocked commands and returned work to the owner; (4) the plugin was not installed in this repo, so `/go-getter:*` skills were missing and versions drifted; (5) one subagent in the whole day, and hand-written prompts for new sessions; (6) decisions asked one at a time although the default was usually taken.
