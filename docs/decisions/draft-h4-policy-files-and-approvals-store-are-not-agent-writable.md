---
id: draft-h4-policy-files-and-approvals-store-are-not-agent-writable
title: The pre-tool hook asks a person before any call changes an active guardrail or an accepted decision, and reads the shell's working directory for the approvals store
status: draft
date: 2026-11-08
tags: [enforcement, hooks]
track: process
governed-facts: [0009-host-capability-matrix]
fitness-functions:
  - "the policy-write-protection test passes: policy writes are asked or denied, reads and new files pass, a cd-first store write is denied"
---

## Decision

- The hook asks a person (on a host whose hook can ask) or denies (on one that cannot) a call that writes an existing file `docs/guardrails/*.md` with `status: active` or `docs/decisions/*.md` with `status: accepted` or `active`. Writes are the file tools that write or edit, and a shell command with a redirect, `sed -i`, `tee`, `cp`, `mv`, `rm` and the like, or an inline interpreter script that names the file. A new file, a draft or a superseded file is open.
- The rule is built into the hook, not a project guardrail, so deleting or editing a guardrail file cannot lift it.
- The approvals store is guarded by **position and name, not by a key**: the hook follows `cd`, `pushd` and `popd` and resolves operands against the directory the shell is in, and it refuses an inline interpreter script that names `approvals.json` or `pending.json`.

## Why

The hook reads guardrails live, so an agent that set `status: superseded` or added a `free=` entry would switch its own limit off. For the store, an HMAC key held outside the project would sit in the same user account the agent runs as, so anything that can run code can read it; it would add a moving part and no protection. A path check closes the spellings a hook can see.

## Tradeoffs considered

- **HMAC-signed store**: rejected above; it protects against nothing an agent with a shell cannot undo.
- **Guardrail-configured write gate**: lets a project opt out by editing the guardrail, which is the attack.
- **Cost accepted**: the agent that authors guardrails (capture, lint fixes) is asked on each edit of an active one. A path built at run time (`node -e` with computed segments, `$VAR` expansion) is not seen; tier 3 and review remain the control for it.
