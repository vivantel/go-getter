---
name: attribute
description: "Write commit messages and PR descriptions that lead with intent (why, not what), using Conventional Commits type prefixes and Refs: trailers linking to docs/{facts,decisions,guardrails,skills}/ artifacts. Use when the user wants to commit changes with attribution, or generate a PR description, e.g. \"commit this with attribution\", \"write a PR description for this branch\"."
---

Write commit messages and PR descriptions that capture *why* a change was made, not just what changed, and keep them traceable to the knowledge artifacts (`docs/{facts,decisions,guardrails,skills}/`) they implement.

This skill only runs when explicitly invoked. Never apply its conventions to a plain `git commit` unless asked.

## Writing a commit message

1. Inspect the staged diff with `git diff --staged`, then run `go-getter refs --staged` (add `--json` to parse it). It prints candidate artifacts in two groups, each with a one-line reason:
   - **Must-have** — artifacts added or changed in the diff, a spec-tool change folder it touches (e.g. `openspec/changes/<id>`), the plan step it completes, decisions whose pack output it regenerates, decisions and guardrails whose checks or restricted paths name a changed file, and decisions it supersedes.
   - **Nice-to-have** — a change whose id is the branch's slug, and one hop from the must-haves: the decisions they are governed by or grounded in, related facts expiring within 30 days, and active siblings sharing a non-umbrella tag.
   If the command is unavailable, propose candidates from what the diff touches.
2. Decide the list yourself and do not ask; the list is mechanical, and a person's review of it costs more than a missing trailer. Take every must-have. Add a decision, fact or guardrail the change plainly implements even if the tool did not list it (one the completed plan step's `Context` names, or one whose item the diff carries out). Take a nice-to-have only when the diff changes behavior it governs. Report the final list in the result, one line per ref with its reason, so the person can amend it afterwards. Ask only if the person asked to review the list.
3. Draft the message:
   - Summary line: `type: summary`, where `type` is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
   - Blank line.
   - A body paragraph explaining the intent — not merely what changed.
   - Blank line.
   - One `Refs: <repo-relative-path>` git trailer per chosen artifact (e.g. `Refs: docs/decisions/0003-commit-trailer-traceability.md`); a change folder is a valid target (`Refs: openspec/changes/add-dark-mode`). Never use an issue number or a prose mention in place of this trailer.

## Writing a PR description

1. Determine the branch's base (the default branch) and run `git log <base>..HEAD`.
2. Build the `Refs` section by collecting the union of `Refs:` trailers already present on those commits — the commits are the source of truth. Then run `go-getter refs --base <base>` and add every must-have it lists that no commit carries, saying which and why in the result.
3. Render three sections:
   - `Intent` — drawn from the commits' body paragraphs.
   - `What changed` — a brief factual summary.
   - `Refs` — the collected artifact paths.

## Shipping

When the user wants the change committed, pushed, opened as a pull request and merged once CI is green, run `go-getter ship --why "<intent>"` instead of the individual git and gh commands: it writes the message and description from the rules above, and stops on a red check or red CI (`--no-merge` opens the pull request and stops; `--dry-run` shows what it would do). It is gated like a push, a pull request and a merge, so expect a prompt where the project gates them.
