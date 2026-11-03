---
id: 0171-grants-only-narrow-down-the-delegation-tree
title: A delegated grant is a subset of its parent's, so authority can only shrink down the tree
status: active
date: 2026-11-03
tags: [coordination, hooks, security]
track: product
accepted-by: sergemso
---

## Decision

1. **A grant** carries a unit's authority: its scope (0167), spend cap, command shapes it may run, the ask policy (0168), the data classes it may touch and the real-world effects it may cause, each inside a cap (0180). It is issued by the parent unit's `Owner-id`, or by the parent's claim holder within the holder's own grant, and recorded as a field of the unit's entry in the claims ledger (0166), with the issuer, so a cloud agent, a CI job or another person's worker reads the same grant and spend rolls up across machines.
2. **Narrowing only.** A child's grant must be a subset of its parent's on every dimension; `go-getter` refuses a grant that is wider, and an agent can sub-delegate within its own grant but never widen it. A child can never approve what its parent could not.
3. **The root is human.** A human starts the root claim and issues the first grant (0130 item 1, 0169). Everything below can be issued by an agent within its grant, so no human act is needed per worker.
4. **Never delegable,** whatever the grant (0130 item 4, 0159 item 2): force-push, history rewrite, deleting a shared branch, repository settings or branch protection, tags, releases and publishing to a channel not declared free.
5. **Spend rolls up.** A unit's spend counts against every ancestor's cap; a cap reached parks the unit as an ask of class spend (0168).
6. **Only a human writes the root grant, and grants cannot be edited.** An entry's grant is immutable once written, and a reader ignores an entry whose grant is not a subset of its parent entry's or whose creating commit was not authored by the named issuer (0166 item 5). The root entry must be authored by an identity listed with kind `human` in `docs/workers.md`, which is a path only a human may change (a restricted path with required human review), and verify as signed once signing exists. Until then this check is **advisory**: an agent that pushes with a human's credentials passes it, so the trust assumption is that credentials are not shared with agents and that the host protects refs under `refs/go-getter/` from force-update and deletion (not every host does). The per-user run record that starts a root run (0130) keeps its protection from an agent's writes.
7. **Per host.** Where `go-getter coverage` shows the hook layer of a host as advisory for human-in-the-loop, a grant's scope, command shapes and spend are advisory there and the report says so; grants over money, physical and legal effects are issued only to workers on a host with a blocking hook for them, or where `go-getter act` is the sole path to the effect (0180 item 5).

It narrows 0130 item 1: starting a run remains human, but delegating below the root no longer needs a person for each worker.

## In force

This decision takes effect with K8 (grants) and, for effects, `discovery-and-outcomes.md` D5. Until then the existing practice applies.

## Why

Per-worker human grants are the HITL delay to remove at thousands of units; a project-wide standing policy cannot give a risky feature less authority than a trusted one. A grant that only narrows gives both: delegation without a human, and a blast radius bounded by the grant the human wrote.

## Tradeoffs considered

- **Flat per-worker grants (today):** simple and auditable; every worker needs a human act.
- **One project-wide policy:** least friction; the widest blast radius for one compromised worker.
- **Cost accepted:** a subset check per dimension, and the grant language must be small enough that the check is decidable.
