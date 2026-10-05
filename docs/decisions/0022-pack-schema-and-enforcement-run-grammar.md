---
id: 0022-pack-schema-and-enforcement-run-grammar
title: Practice packs are JSON files with questions, options and per-answer artifact templates; enforcement runs use a builtin-or-command grammar
status: active
date: 2026-10-05
tags: [practice-packs, interview, enforcement, configuration]
track: process
accepted-by: sergemso
fitness-functions:
  - npm run check:packs validates every pack against compiler/schemas/pack.schema.json and the semantic rules below
---

## Decision

**Format**: `src/packs/<id>/pack.json` — JSON, parsed with zero dependencies (0019).

**Fields**: `id` (kebab-case, equals the directory), `version` (semver), `family` (`harness | sdlc`), `components` (harness component numbers 1–12 from fact 0002; required and non-empty for harness packs), `requires` (other pack ids), `title`, `summary`, `questions`, `outputs`.

- A **question** has `id`, `prompt`, `options` (≥2; each `id`, `label`, `tradeoff`, optional `recommended: true` — at most one per question), optional `multi`, optional `detect` (a detection-probe key whose value prefills the answer) and optional `when` (`{question, in: [option ids]}`, referring to an earlier question).
- **Outputs** are keyed `outputs[questionId][optionId]` and hold lists of templates: `decisions`, `guardrails`, `procedures`, `facts`, `files`. An artifact template has `slug`, `title`, `tags`, `body` and optional `frontmatter` (extra kms fields, e.g. `track`, `governed-by`) and, for guardrails, `enforcement`. A file template has `path` and `content`.
- **Placeholders** in titles, bodies, frontmatter values and file content: `{{answer.<q>}}`, `{{label.<q>}}`, `{{detect.<key>}}`, `{{id.decision.<q>}}` (id of the decision emitted for question `q`), `{{pack.id}}`, `{{pack.version}}`.
- Every emitted artifact also receives `go-getter.generated-by: <id>@<version>` and `go-getter.pack-answer: <questionId>` (0008).

**Enforcement `run` grammar** (0007, 0009): either `builtin:<check-id>` followed by space-separated `key=value` arguments (values may be double-quoted) — run by `go-getter check` from `compiler/src/checks/builtin/` — or any other string, which is a shell command run from the project root.

## Why

Packs must be uniform, testable data (0008) that a deterministic renderer can turn into kms artifacts, so that numbering, frontmatter and INDEX rows never depend on the agent.

## Tradeoffs considered

- **YAML packs**: friendlier to write, but needs a larger parser surface for nested data; JSON is native to Node.
- **Free-form Markdown packs**: easy to author, impossible to validate or render deterministically.
- **Commands only in `run`**: simplest, but every check would need a script; builtins cover the common cases portably.
