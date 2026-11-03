---
id: 0168-human-asks-are-parked-in-a-routed-queue-and-never-hold-a-worker
title: A unit that needs a human is parked in a routed queue and releases its worker; a human's delay never blocks other units
status: active
date: 2026-11-03
tags: [coordination, hooks, agent-roles]
track: process
accepted-by: sergemso
---

## Decision

1. **Parking.** When a unit reaches an ask-trigger of 0155 or a `Human:` step, it records the ask (what is lost or changed, the recommended default, the evidence), sets its state to `parked` and releases its worker, which pulls other work. The claim stays, with a longer bounded lease (0166).
2. **Routing.** The ask goes to a queue routed by the unit's owner chain; if the project declares path owners, by those. Any human on the route may answer. An answer is recorded with the answerer's identity and releases the unit back to `ready`.
3. **Timeout policy by class.** Each ask carries `reversible` or `irreversible`, set by the unit's owner when it parks. A reversible ask may take the recommended default after its timeout and log it as a `draft` decision (0155). An irreversible ask, and every ask raised by a change to a committed decision, a data-class or security impact or spend over budget, never proceeds on timeout: it escalates up the owner chain, and past the last owner the unit is released and marked `blocked-by-human`.
4. **Visibility.** Units that need a parked unit are marked `blocked-by-human` in the computed tree (0174); the wait is measured per ask (0170), so delay is seen, not hidden.
5. **Unrecoverable actions** still stop at the host prompt as in 0159; this decision covers asks that are about direction, not about destroying state.

It extends 0155 (triggers and default-and-log) and 0159 (stops are guides); the single "owner" of those decisions becomes a route of owners.

## Why

A synchronous prompt holds a worker slot until one particular human answers; with many humans and thousands of units, one slow human would stall everything that needs that slot. Parking turns a human delay into a measured wait that other work flows around.

## Tradeoffs considered

- **Synchronous prompts:** zero machinery, but the stall above.
- **Digest-only review:** highest throughput, but no way to stop a wrong direction on a large unit before the spend.
- **Cost accepted:** a queue to build and a route to maintain; a reversible default may later be rejected in the digest, in which case the work it drove is re-planned (procedure `reviewing-the-daily-digest`).
