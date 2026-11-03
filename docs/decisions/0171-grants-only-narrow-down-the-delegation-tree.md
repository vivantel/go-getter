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

1. **A grant** carries a unit's authority: its scope (0167), spend cap, command shapes it may run, the ask policy (0168), the data classes it may touch and the real-world effects it may cause, each inside a cap (0180). It is issued by the parent unit's `Owner-id`, or by the parent's claim holder within the holder's own grant, and recorded in the per-user store beside the run record (0130), with a reference to the issuer on the unit.
2. **Narrowing only.** A child's grant must be a subset of its parent's on every dimension; `go-getter` refuses a grant that is wider, and an agent can sub-delegate within its own grant but never widen it. A child can never approve what its parent could not.
3. **The root is human.** A human starts the root claim and issues the first grant (0130 item 1, 0169). Everything below can be issued by an agent within its grant, so no human act is needed per worker.
4. **Never delegable,** whatever the grant (0130 item 4, 0159 item 2): force-push, history rewrite, deleting a shared branch, repository settings or branch protection, tags, releases and publishing to a channel not declared free.
5. **Spend rolls up.** A unit's spend counts against every ancestor's cap; a cap reached parks the unit as an ask of class spend (0168).
6. **Grants are not state an agent can write for itself:** the store has the same protection as the approvals store; the hook reads it.
7. **Per host.** On a host with no blocking pre-tool hook (Copilot, Kilo, OpenCode) a grant's scope, command shapes and spend are advisory and `go-getter coverage` says so; grants over money, physical and legal effects are issued only to workers on hosts with a blocking hook, or where `go-getter act` is the sole path to the effect (0180 item 5).

It narrows 0130 item 1: starting a run remains human, but delegating below the root no longer needs a person for each worker.

## Why

Per-worker human grants are the HITL delay to remove at thousands of units; a project-wide standing policy cannot give a risky feature less authority than a trusted one. A grant that only narrows gives both: delegation without a human, and a blast radius bounded by the grant the human wrote.

## Tradeoffs considered

- **Flat per-worker grants (today):** simple and auditable; every worker needs a human act.
- **One project-wide policy:** least friction; the widest blast radius for one compromised worker.
- **Cost accepted:** a subset check per dimension, and the grant language must be small enough that the check is decidable.
