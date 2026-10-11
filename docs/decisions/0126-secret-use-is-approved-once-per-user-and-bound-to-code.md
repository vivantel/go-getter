---
id: 0126-secret-use-is-approved-once-per-user-and-bound-to-code
title: A command's use of a secret file is approved once per user, bound to its code, and recognised by what it runs
status: active
date: 2026-10-11
tags: [governance, security, enforcement, hooks]
track: product
accepted-by: sergemso
---

## Decision

go-getter exists to enable agents, so using a secret file without seeing its values works with no setup in the common case. This refines 0072 (access modes) and 0107 (`secret run` and `put`); the property they protect stays: the agent never sees the value (scrubbed output, no echo).

- **Approvals are personal and live outside git.** A remembered approval is a record in a per-user file, never committed: the command, the secret path it may use, a hash of the code it runs, and when. It never holds a value. It applies to one project only, even for an identical command line elsewhere.
- **An approval is bound to the command and its code.** The hash covers the command's own files and the project files they import locally (exact for JavaScript and shell, best effort for other languages). A change anywhere in that set asks again; an edit to an unrelated file does not. An approval expires only when the hash changes, never by the clock, and `go-getter approvals` lists and revokes them.
- **First use is one prompt, then remembered.** The first time a command wants a secret file, the host asks the human once, naming the command and the file; approving also records it. Later runs of the same command with the same code are silent. A host whose pre-tool hook cannot ask hands the command over, and the human records the approval with `go-getter approvals add`.
- **The team list stays.** The committed `use-commands` answer remains the shared, reviewed allowlist. A command may use a secret if the shared list names it or the user has approved it; one person's approval never grants anything to an agent on another machine.
- **go-getter is recognised by what a call runs, not how it is spelled.** The project runner (`.go-getter/bin/go-getter`), a `go-getter` on `PATH` or under the home directory, `npx`, and `node <entry>` are all go-getter wherever a feature recognises a go-getter call (the secret exemption, ask rules for the plan write verbs). The project-local install wins when both exist. No symlink, no list of spellings.
- **Commands are parsed, not scanned.** The hook tokenises a command and blocks a restricted path only when it is a real operand or redirect target of what runs; text inside quotes or a heredoc body (a commit message, an `echo`) is only text. A command is exempt only as one simple command, not a pipeline or a substitution, and quoted arguments are allowed. A script that opens the file by itself is invisible to any text check; the approval hash and the scrubbed output are what cover it.

## Why

Using a secret file safely took a `PATH` symlink, unquoted plain words, an exact-text entry per command in an answer edit, and a hook that refused a whole shell call for merely mentioning a restricted path (a dozen false denials in one session). That friction defeats the harness's purpose. Personal, hash-bound approvals keep the one control that matters (a human decided, and the decision lapses when the code changes) while removing the setup.

## Tradeoffs considered

- **Approvals committed in the repo:** shared and reviewable, but every new approval is a pull request, the ceremony being removed. The shared list stays for teams that want it.
- **Command text only (today):** simple, but an agent could change what an approved command does unseen. Rejected: the hash costs one click only when the code really changes.
- **The whole tracked tree as the hash:** airtight and trivial, but every commit would ask again.
- **Allow everything inside the project's own scripts, with no prompt:** frictionless, but it rests on output scrubbing alone and trusts whatever the agent can write.
- **Approvals across every project on a machine:** fewer prompts, but a different file with the same name in another repository would inherit one.
- **Costs accepted:** a static import scan that is exact only for some languages, a per-host first-use prompt that needs a spike per host, and one prompt for each new command.
