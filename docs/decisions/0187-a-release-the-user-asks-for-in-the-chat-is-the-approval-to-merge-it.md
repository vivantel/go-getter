---
id: 0187-a-release-the-user-asks-for-in-the-chat-is-the-approval-to-merge-it
title: A release the user asks for in the chat is the approval to merge it; no command is typed
status: active
date: 2026-11-04
tags: [hooks, enforcement, security]
track: product
accepted-by: sergemso
---

## Decision

Accepted by the owner 2026-11-04. Item 2 (the fixed phrase) and the matching rule of item 3 are superseded by decision 0188, which reads the request with a small model; the other items stand. It changes how the human approval of 0155 item 2 is recorded: the explicit go-ahead in the session (0130 item 4) becomes the user's own request, replacing the typed `go-getter approvals release <version> <sha>` of throughput step T5 (0157). 0094, 0155, 0159 item 2, 0171 item 4 and 0186 item 5 stand: a release stays a human act, never an approvable shape, a run grant or a delegable grant. The request approves **merging the release pull request** only; publishing still starts from a pushed version tag.

**What this protects against.** A mistaken or prompt-injected agent acting through the host's tools. It does not stop an agent that runs arbitrary code or edits the CLI in its worktree; the typed approval does not either (items 7 and 8). A boundary an agent's credentials cannot reach (a required reviewer on the release workflow, or review of the release pull request from another account) remains the stronger control.

1. **The host reports what the user submitted.** On a host whose user-prompt event is shown, in its fact, to be told apart from prompts the host starts itself (capability `hooks.userPrompt`; first Claude Code `UserPromptSubmit`, which records only when `CLAUDE_CODE_SESSION_ATTENDED` is `1` in the hook's environment, a value the CLI sets itself), a hook parses each prompt and, on a match, writes a *release request* to the protected per-user store, in its own directory, one file per request. The record holds the repository identity (the real path of its git common directory), the host's non-empty session key, the time, the release asked for (a bump or a version), and the default branch's head on the remote at that moment (one short read-only lookup, no fetch; no request is saved when it fails). Never the prompt text. The hook holds the prompt only in memory, writes and logs nothing for a non-matching prompt (not even in error output), prints nothing, never blocks and fails open (0018).
2. **The grammar is small and anchored.** After NFKC folding, removal of zero-width characters, case-folding and removal of trailing punctuation, the whole prompt must be `release`, an optional `the` and an optional `next`, then `patch`, `minor` or `major`; or `release` and `v?X.Y.Z`. A bare `release`, a question, a longer message or a paste containing the phrase records nothing. English only until a pack answer carries the phrases.
3. **The CLI takes the request when it checks the approval.** The pre-tool hook sees the session; the CLI does not, so the hook writes the claim and the CLI reads it. `go-getter release --batch` (plain, under `go-getter watch`, with `--timeout` or `--interval`; not with `--allow-no-ci` or `--project`) keeps its typed approval. Where none is recorded, the pre-tool hook finds an unconsumed request of the same session, at most 60 minutes old, and hands the CLI a single-use claim on it. The CLI consumes the claim at its approval check, after its own fetch and computation, and proceeds only if the request fits: the named bump equals the computed bump or the version equals the computed version, and the default branch's head equals the head recorded in the request. Otherwise it refuses, names what would be released and what to say to approve it (0159 item 4), and leaves the request unconsumed. Consumption is atomic (the file is removed once). A dry run consumes nothing.
4. **One request, one release.** After the check the request is spent, whatever happens next; a retry after a red CI asks again. The CLI re-checks the default branch head before it merges and refuses if it moved. Commits merged after the request make the head differ, so an agent cannot grow a patch into a minor behind the user.
5. **Provenance is recorded.** The release pull request body says "requested by the user in the chat (session <hash>)" instead of "recorded by a person", `approvals list` shows each pending request with its session and age, the refusal texts name both routes, and the daily digest procedure step is updated.
6. **Hosts.** Claude Code first. Another host gets `hooks.userPrompt` only when its fact records the event's payload, its session key, whether it fires for headless, resumed, scheduled or injected prompts and any source marker. Without it, or without a blocking pre-tool hook, the typed approval stays.
7. **Hardening this relies on, shipped first and as its own change** (it also closes holes in 0094 and 0186): the release gate and every approval check ignore `GO_GETTER_HOME` and `XDG_STATE_HOME` unless a test flag is set; the store guard reads commands through wrappers (`env`, `nohup`, `timeout`, `sh -c`, `eval`) as `commandOf` does; an agent's call to `go-getter hook <event>` is denied under any spelling, as is its call of a host CLI that resumes or names a session (`-c`, `--continue`, `-r`, `--resume`, `--session-id`). Even with these, an agent that edits `compiler/` or `.go-getter/cli` in its worktree decides what the hook and the CLI do.
8. **Stated limits.** A headless host process the agent starts (`claude -p`, `codex exec`) is refused by the attended marker on Claude Code (probed 2026-11-04; fact 0003). A terminal multiplexer typing into an interactive session the agent started reports as attended, and a host that has no such marker cannot tell a started process from a person; until those close this is friction reduction, not a security boundary.
9. **Prompts the host starts itself are denied at their source.** Claude Code fires `UserPromptSubmit` for a scheduled or looped task, a background subagent's report and a message another session sends to the main conversation, and marks none of them in the payload or the environment. The pre-tool hook therefore denies an agent's call to a tool that would submit text later (a scheduled task, a wake-up, a message to the main conversation) when that text, normalised as in item 2, matches the grammar. A host-started turn wrapped in other text does not match the anchored grammar either; whether it is wrapped is to be probed.
10. **Telemetry** records metadata only: the hook logs a request saved or not, a claim handed over and a denial, as class, outcome and trigger; what the CLI consumed shows in the release pull request.

## Why

The owner's request "release next minor" is already the deliberate act; asking for a command with a sha repeats it, and fact 0040 found most owner turns were such confirmations. The event comes from the host, not from the transcript or from text the agent wrote, and the CLI checks the request against its own fresh computation, so the hook needs no fetch and cannot approve a stale or larger release.

## Tradeoffs considered

- **Typed `approvals release` (throughput T5 as built):** the least code, but a second act after the first, and forgeable today through a store override and wrapper spellings (item 7).
- **Reading the host transcript (0186):** needs a transcript and a forged line passes; this reads the host's own submit event and stores only the parsed request.
- **A host prompt (0137):** asks again for what the user just said, and only where the host can ask.
- **Approving the release pull request, or a standing grant for patch and minor:** the stronger boundary (item 8), each needs more machinery; either can be added beside this.
- **A bare `release` or `please release`:** dropped, because an agent can ask for that word for another reason.
- **Cost accepted:** a user who types the exact phrase to an agent they did not mean to release approves a release; a request is spent by any head change, so the user asks again after another merge; and below 1.0 a breaking change is a minor bump, so "release minor" approves it (the owner chose this over asking for a separate word, 2026-11-04).

## Still to probe

Built and in force with these unprobed on Claude Code; each is recorded in fact 0003 when settled, and a result that opens a path is a reason to supersede item 9:
1. That an interactive session's hook sees `CLAUDE_CODE_SESSION_ATTENDED=1` (read from the Bash tool's environment, not from a hook).
2. Whether a scheduled task, a subagent's report and a cross-session message reach the hook with their prompt text wrapped or bare.
3. Whether a resumed session keeps its `session_id`, and whether a subagent's calls share the parent's.
4. Other hosts: all of it; `hooks.userPrompt` stays off until their facts record it.

Not done here, by design: a plan step with its issue (issues are written by a person's approval) and the chat route in the text of the guardrail `gated-actions-need-human-approval`.
