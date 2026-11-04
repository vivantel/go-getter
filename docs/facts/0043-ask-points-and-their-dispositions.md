---
id: 0043-ask-points-and-their-dispositions
title: Every point where go-getter asks a human, what it protects and its disposition
status: active
date: 2026-11-04
tags: [hooks, enforcement, governance, roadmap]
kind: environmental
last-verified: 2026-11-04
---

Audit for plan step G5 against decision 0159 item 6, at master 3bac131. "Native" is a host ask rule (a prefix glob an allow rule cannot override); "hook" is a pre-tool hook ask (Claude Code only) or, where the host cannot ask, a deny with a hand-over. Dispositions: keep, default (free by default), remove, propose (needs a superseding decision).

## Runtime stops

| # | Ask point | Where | Protects | Disposition |
|---|---|---|---|---|
| 1 | `git push` force, delete, `+refspec`, `:ref`; `git tag -d`; `git filter-branch`/`filter-repo`; `rm -rf`; destructive SQL (`psql`, `mysql`, `sqlite3`) | native, hitl `gated-classes` (irreversible) | Remote history, tags and local files nothing in the checkout can restore | Keep (0159 item 1: not state-dependent) |
| 2 | `git branch -D`, `git reset --hard`, `git rebase`, `git worktree remove` | hook only, by repository state (`gate-state.mjs`) | Unpushed commits, uncommitted work, unpublished history | Keep; stops only in the unsafe state (G1). Copilot, Kilo, OpenCode: deny today; branch `feat/hookless-host-floor` (ab8c134, G4) replaces it with a checkpoint and a logged pass, no prompt |
| 3 | `repo-settings`: `gh repo edit/delete/archive/rename/transfer`, `gh secret`, `gh variable`, `gh ruleset`, `gh api -X` | native | Access, branch protection, secrets | Keep (0159 item 2) |
| 4 | `gh release create`, `npm/pnpm/yarn publish` | native until a channel is freed, then hook | Production users | Keep; `free-channels` (default empty) frees prerelease and non-latest dist-tags |
| 5 | `git push` (plain), `pr-create`, `pr-merge`, `pr-close` | hook decides: `run-grants` default frees all four after preconditions (green checks, default base, run step); first use asks once and is remembered | Merging unreviewed or red work; a push to the default branch | Default already done (G7); keep the preconditions. Hook-less hosts: hand-over |
| 6 | `go-getter pr`, `go-getter ship` | gated only when a part is neither freed nor grantable (`gatedVerbs`) | Same as 5 | Default already free (G7); keep for a project that lists none |
| 7 | `gh issue comment`, `gh pr comment` (`comment-post`) | native, outward class, not freed or grantable by default | Text visible to others | Propose: free by default or add to default `run-grants`; 0159 item 2 names only release, publish and settings as gated, but changing a pack default needs a decision |
| 8 | `extra-patterns` (project prefixes, `/regex/`) | native or hook | Whatever the project names | Keep; the project states the protection |
| 9 | MCP write tool of an allowlisted server (`mcp-policy` = allowlist) | hook ask once, remembered, or run grant | Writes through third-party code | Keep; default `mcp-policy: off` asks nothing |
| 10 | First use of a secret by an unapproved command | hook ask, remembered until the files change (0126) | Secret exposure | Keep |
| 11 | `go-getter plan issue create/comment/close` | native or hook, tracker `writes` = `ask` (recommended) | Issues others see | Propose: `allow` as the recommended default (the verbs already refuse secrets and personal data); needs a decision |
| 12 | `go-getter approvals add/allow/release/revoke`, `plan approve`, `run end`, `run start` with extra flags | deny, a person runs it | An agent granting itself what it may do | Keep; not a prompt, a person's deliberate command |
| 13 | A release (0155, 0187, 0188) | the user's chat request is the approval; no prompt | Production release | Keep; zero extra prompts |
| 14 | Cache hygiene confirm-before-switch (`context`, recommended `advisory-and-confirm`) | no hook exists in the compiler; instruction only | Prompt cache | Propose: promise a confirmation that is not built; either build it or drop the wording from the recommended option's tradeoff |

Not asks: the verification gate, secret scan, restricted paths, branch name, commit message and default-branch checks deny or block with a reason and never wait for a person.

## Interview and skill questions

| # | Ask point | Protects | Disposition |
|---|---|---|---|
| 15 | `go-getter-init`: one question per pack question, 77 questions over 12 packs, most with a default or a recommended option, each with one recommended option or a default | Choices that become decisions and guardrails | Keep; `--defaults` and `gg update --accept-defaults` already skip the loop for an approved plan (0155); only unanswered questions are asked on update |
| 16 | `go-getter-init` confirms what `gg detect` finds | A wrong detected command becoming a check | Default: state the finding and proceed unless corrected; ask only when `detect` is empty |
| 17 | `clarify`, `roadmap`: interview until shared understanding; `roadmap` asks where to write and for a final go-ahead before writing | Writing artifacts the user did not agree to | Keep: the interview is the purpose of the skill. Location question: default to `docs/` when it exists |
| 18 | `changelog`: asks for the version and date | A wrong version in a release record | Default: take the version from the release request or `package.json` and the date from today |
| 19 | `refactor-plan`: asks the user to resolve a guardrail conflict | Silently breaking a guardrail | Keep |
| 20 | `uninstall`: per finding detach, remove or keep, after an overview | Deleting project knowledge | Keep |
| 21 | `capture`, `conform`, `lint`, `attribute`: no question; findings are reported | n/a | none |

## Prompt rate

`go-getter metrics day` on 2026-11-04 reports `mergedPrs` 19 and `humanTurns` 0 (no local transcripts in the audit worktree). It has no prompt count: the stop log (`gate:stop` records, G3) is written but `metrics/day.mjs` does not read it, so prompts per merged PR cannot be reported yet. The budget of 0159 item 5 is therefore unmeasured. Follow-up: plan step G5a.

## Result

No ask point lacks a stated protection. No change was applied: every default that could be freed (rows 7, 11, 14, 18) either needs a pack default changed or a decision superseded, which 0159 does not already allow in so many words. Rows 7 and 11 are proposals for superseding decisions; row 14 is a doc or build fix; 16 and 18 are skill text changes. Parked asks (`work-coordination.md` K7, K11) join this table when they land.
