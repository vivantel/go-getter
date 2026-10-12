---
id: 0140-foreign-packs-and-helpers-are-vendored-pinned-and-held-to-the-cores-budgets
title: Foreign packs and helpers are vendored by digest, trusted through the pull request, and held to budgets the core enforces
status: active
date: 2026-10-12
tags: [architecture, roadmap, practice-packs, cost]
track: product
accepted-by: sergemso
---

## Decision

The L.9 interview (2026-10-12) settled whether and how code from outside this repository loads. It completes 0118 and 0119 and builds no protocol yet.

1. **Identity and source.** A foreign pack or helper is named in the project manifest by a git URL and a content digest (0119 item 5) and vendored into the repository by `apply`. The digest is verified on every `apply` and check; nothing is fetched at run time and nothing comes from npm (0096).
2. **Trust is the pull request.** The pull request that adds or updates the vendored copy is the review. `apply` and the checks refuse an item that is unpinned, whose digest does not match, or that needs a capability (`read`, `write`, `network`, `spawns`, `hierarchy`) the pack answer does not list. There is no per-user approval and no publisher allowlist.
3. **A foreign pack is data and builtin checks.** Questions, outputs, guardrail text, skills and the builtin check kinds go-getter ships; no `run` command, script or hook of its own. This is the recommended default applied when the interview question was unclear; widening it (shell checks with declared capabilities) needs a new decision.
4. **The helper protocol is built only when a trigger holds.** The triggers are a second implementation of a kind, or a third party who asks to write one. The first kind is the work source (a GitLab tracker is the model case: an executable, not a pack). Until a trigger holds, foreign packs may load and no helper process does.
5. **Token efficiency is enforced by the core, never trusted to the author.** Everything a helper returns is typed data; the core renders the text an agent sees from the typed fields, so a helper's free text and raw output never reach the agent as such. Beyond that shape check, the core holds every answer to budgets, in-tree sources included:
   - `list` returns summaries only (id, title, state, needs, class, issue); bodies and detail come from `get`, one step at a time.
   - Text fields have length caps, an answer has a byte cap and `list` an item cap; over a cap the core truncates, reports the count dropped, and marks the answer `stale` or `unavailable` where the data would mislead.
   - Reads are cached with a time limit (the overlay cache of 0117), so a repeated call does not reach the helper.
   - Writes have a dry-run form that prints the request and sends nothing.
   - The contract tests every helper of a kind must pass (0119 item 9) include these budgets, so an author sees a failure before a project does. The initial limits are set by the build from measured in-tree sources.

## Why

The owner will not write most extensions and needs a third party's work to cost no more tokens than the built-in one. A promise from an author is not a guarantee; a cap in the one function every source passes through (`callSource`) is. Pinning, vendoring and review in a normal pull request reuse the process the project already has, and keeping foreign packs to data keeps foreign shell out of CI and developer machines until a case justifies it.

## Tradeoffs considered

- **Per-user approval before first use:** stronger, but friction for a pinned, reviewed copy.
- **A publisher allowlist:** cheap, but a name is not content.
- **npm packages or run-time fetch:** familiar to authors, but a network fetch at install time (the failure 0096 exists for).
- **Foreign shell checks with declared capabilities:** more reach, rejected for now.
- **Building the protocol now for work sources:** proves it early, but designs it from one implementation (0118).
- **Costs accepted:** budgets can truncate a legitimate large answer; the initial numbers are guesses until measured; a helper author works against a contract suite rather than a free-form API.
