---
id: 0180-real-world-effects-are-classed-in-grants-and-delegable-only-inside-a-human-written-cap
title: Real-world effects are classed in grants and delegable only inside a human-written cap
status: active
date: 2026-11-03
tags: [coordination, security, guardrail]
track: product
accepted-by: sergemso
---

## Decision

1. **Effect classes** are a dimension of a grant (0171): `reversible`, `money`, `physical` and `legal`. An action belongs to the most restrictive class it touches.
2. **Reversible** effects need no cap. **Money, physical and legal** effects are delegable only inside a cap a human wrote: an amount and period for money, a zone or object set for physical action, a contract type and counterparty set for legal commitments. The cap narrows down the tree like every grant dimension; a child's cap is at most its parent's.
3. **Irreversible and uncapped is never delegable,** where irreversible means that nothing in the project's record can undo the effect; every money, physical or legal effect counts as irreversible unless the action map (item 4) says otherwise; the `reversible|irreversible` class of a parked ask (0168) is a separate label set by the unit's owner. Never delegable, by any grant. The always-human list of 0130 item 4 and 0159 item 2 stays, and gains: a payment above the cap, physical action outside the zone, signing or terminating a legal commitment outside the contract set, and anything whose class is unknown.
4. **A project names its actions.** A pack or domain file maps concrete actions (a payment method, an actuator, a signing tool) to a class; an action not mapped has an unknown class and is treated as item 3.
5. **One path to act.** A real-world action is performed through `go-getter act <action> …`, which looks the action up in the action map, checks the grant's cap for its class, logs the effect (item 6) and then calls the tool. A host agent gets a hook that denies the raw effect tools and names the verb; a worker that is not a host agent (a robot controller, a payment service) is configured to call the verb. The guardrail is tier 2 only where the verb is the sole path to the effect; elsewhere it stays tier 1 and `go-getter coverage` says so.
6. **Every real-world effect is logged** as metadata (class, amount or zone, unit, holder) and counts toward the unit's and its ancestors' caps.
7. **A cap reached parks the unit** as an ask (0168).

## In force

This decision takes effect with D5 (effects and `go-getter act`). Until then the existing practice applies.

## Why

An agent that buys, signs or acts physically needs authority a human can bound. A cap written by a human and narrowed down the tree gives a limited blast radius without a human per action, which "always human" would require and "project's own classes" would leave unsafe by default.

## Tradeoffs considered

- **Always human:** safest, but an embodied or purchasing agent then waits for a person on every action, against the goal.
- **Project-defined classes only:** most flexible, but nothing is safe by default and grants cannot be compared across projects.
- **Cost accepted:** a small vocabulary of classes to maintain, an action-to-class mapping per domain, and the risk that a wrongly classed action passes; an unknown class fails closed.
