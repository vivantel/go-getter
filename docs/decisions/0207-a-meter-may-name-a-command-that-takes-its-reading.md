---
id: 0207-a-meter-may-name-a-command-that-takes-its-reading
title: A meter may name a command that takes its reading
status: draft
date: 2026-11-05
tags: [coordination, observability, knowledge-base]
track: product
---

## Decision

Extends the meter file of decision 0179 item 1; the reading, its ref and its checks are unchanged.

1. **A new optional meter field `command`**: a program and its arguments, split on spaces and run without a shell, in the project root. Its trimmed standard output is the reading's value.
2. **`go-getter measure read <meter>` without `--value` runs that command** and records the output as the value. With `--value`, the given value is recorded as before. A meter with no `command` and no `--value` is refused.
3. **The output is a value like any other**: it passes `readingProblem` (a number, a boolean or a short token, never free text), so the secret and personal-data scan applies. A command that exits non-zero records nothing.
4. **`measure define` refuses an empty `command`.**
5. **The command is in a file the owner committed**, so running it is the same trust as running a repo script; it is not read from a reading or from a remote ref.

## Why

Step P5 of the paper-instruments plan (issue #318) needs daily readings of the share of derived enforcement entries and of advisory-only guardrails, as two meters with one numeric reading each (a fraction between 0 and 1), taken by a command and not estimated. `measure read` took only a value typed by the caller, so the figure would have been a person's transcription. Letting the meter name its own command makes the reading reproducible and keeps the meter definition the single place that says how it is read.

## Tradeoffs considered

- **A new `measure` subcommand per instrument**: a CLI surface for each meter; rejected.
- **A person runs the script and types the result**: the step's done-when forbids it.
- **Cost accepted**: a meter file can now cause a command to run when read; the guard is that the file is a reviewed, committed repo file.
