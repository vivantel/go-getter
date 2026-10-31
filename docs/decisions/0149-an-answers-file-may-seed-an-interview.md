---
id: 0149-an-answers-file-may-seed-an-interview
title: An answers file from another project or a profile may seed an interview as untrusted data, validated and shown before it is rendered
status: active
date: 2026-10-31
tags: [interview, practice-packs, security]
track: process
accepted-by: sergemso
---

## Decision

Extends 0085 and 0147; supersedes none. 0003 rejects preset profiles; this decision adds none: the file is the owner's own record of answers, and profiles are 0150.

1. **`--answers-from <file>`** on `interview next` and `render-pack` takes an answers file (the `{ answers, acceptedBy, detect }` shape) as the starting answers. Questions it answers are not asked; the others are asked as usual.
2. **It is data.** The file holds answers only. `interview validate` checks every answer against the pack: option ids, `pattern`, `when`, types. Unknown keys and answers to questions the pack does not have are refused, not ignored. It never names a path to read, a command to run or a URL to fetch, and go-getter makes no network call for it.
3. **`acceptedBy`, `date` and `detect` are never taken from it.** The person running the interview supplies their own, as 0045 and 0091 require, and detection is of this project.
4. **Same gates as any render.** The dry run lists the files and rules it produces, and one go-ahead precedes the write. A seeded answer is shown as seeded, and each rendered decision is `draft` until accepted.
5. **Profiles are not defined here.** A pack's profiles (0150) expand into answers like those of such a file.

## Why

Projects of one owner repeat the same answers; asking them again is the cost the owner reports. Treating the file as untrusted data keeps the seeded path as safe as typing the answers.

## Tradeoffs considered

- **Copy the other project's `docs/`**: complete, but carries decisions, dates and acceptances that belong to another project.
- **Trust the file**: simpler, but a shared file could turn on or off enforcement unnoticed.
- **Cost accepted:** answers drift between the source project and this one; the draft status and the dry-run listing are the check.
