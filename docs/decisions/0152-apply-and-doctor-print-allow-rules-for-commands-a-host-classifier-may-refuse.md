---
id: 0152-apply-and-doctor-print-allow-rules-for-commands-a-host-classifier-may-refuse
title: go-getter prints the allow rules a person may add for commands the project frees or approves, and never writes them
status: draft
date: 2026-10-31
tags: [hooks, claude-code, enforcement, host-agents]
track: process
governed-facts: [0009-host-capability-matrix]
---

## Decision

A host can run its own classifier on top of a project's guardrails (in Claude Code's auto mode it refused `gh pr merge`, `go-getter plan issue create` and an agent writing its own `.claude/settings.local.json`). The project's answers (decisions 0094, 0120, 0127) decide whether a human is asked; they do not decide what the host's classifier allows. This decision lets go-getter tell the person, without acting for them.

- **What is suggested.** The commands that the project's answers free or expect a human to approve, and that a host classifier may therefore still refuse: the `free` ids of every `gate-command` guardrail (outward catalog entries, 0120), and the `go-getter plan issue` verbs when the tracker pack's `writes` answer is `ask` or `allow` (the `go-getter=` list of its gate, or `tracker-writes` from `adoptedData`). Nothing is suggested when none is freed and `writes` is `off` or the tracker pack is not adopted.
- **How the rules are derived.** From the catalog and the verbs, never from a second list. A catalog id's native globs (`nativeRules`) give the command (`gh pr merge *`); the plan-issue verbs come from `VERBS` in `trackers/write.mjs`, spelled as the project runs go-getter (`goGetterSpellings`, the first one that exists). A suggestion is the command's own glob and nothing wider: only entries whose globs end in ` *` after a fixed command are suggested, so `Bash(gh pr merge:*)` is, but `Bash(*)`, `Bash(gh *)` and `Bash(git push *)` for a force-push are not. Irreversible commands are never suggested. A prefix rule for `git push` also covers a force-push, but on Claude Code the committed ask rule for it still wins over an allow rule (0094).
- **Where it is printed.** A new read-only `go-getter doctor` prints the suggestions per host; `go-getter apply` prints the same text in its report when there is something to suggest. Both use one function, `allowSuggestions(project, hosts)` in `compiler/src/allow-rules.mjs`. Output only: no file is created, edited or chmod-ed, in the project or in the home directory, and the project's `git` state is untouched.
- **Host-neutral source.** The function knows no host's file or syntax. A host's capability file declares `permissions.userAllow` (`file`, `format`, same format names as `permissions.ask`) when it has a person-owned allow layer; the function renders the globs by that format and names the file from it. Only Claude Code declares it (`.claude/settings.local.json`, `claude-permissions`); a host without the field gets no suggestion. Kilo and OpenCode are left out until someone has tested the layer there.
- **Who adds the rule.** The person, in the gitignored local settings file (not the generated `.claude/settings.json`), kept out of git with `.git/info/exclude`. The printed text says so and that `!` at the prompt runs a command in the session. go-getter never writes the file and an agent must not either: granting oneself permissions is the boundary the classifier enforces, and the file is not go-getter's to write (`generated-host-files-not-hand-edited`, `owned-files-never-clobbered`).

## Why

A person who follows go-getter's docs can still be stopped by a layer go-getter does not control, and then concludes the tool is useless. The way through is one narrow rule the person owns. Printing it costs nothing and keeps the boundary: go-getter configures the project's harness (0015), the person grants their own session its permissions. Deriving the strings from the catalog keeps them from drifting when the catalog changes (0129).

## Tradeoffs considered

- **Apply only:** the hint appears once, at setup, and is gone when the classifier refuses weeks later. `doctor` can be run when it happens.
- **Doctor only:** nobody runs it before the first refusal. Apply prints it only when something is freed, so it adds no noise otherwise.
- **Writing the rule with `--force` or a confirm:** one step for the person, but go-getter would grant permissions on the person's behalf and own a file that is theirs; refused.
- **Hard-coded command lists per host:** simple, drifts from the catalog; refused.
- **Cost accepted:** a suggestion can be pasted and still not help (the classifier may judge the context, not only the command; and for the plan-issue verbs under `writes: ask` the committed ask rule beats an allow rule on Claude Code, so the rule is a try, not a promise), and a project on Kilo or OpenCode gets nothing until their layer is confirmed.
