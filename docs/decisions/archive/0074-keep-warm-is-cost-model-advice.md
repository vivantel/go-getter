---
id: 0074-keep-warm-is-cost-model-advice
title: Cache keep-warm is advice from the cost model, not an autonomous pinger skill
status: deprecated
date: 2026-10-05
tags: [cost, model-routing, harness]
track: product
governed-facts: [0028-prompt-cache-refresh-and-prewarm, 0011-model-pricing-anthropic]
---

## Decision

Withdrawn 2026-10-05 by the owner: the advice has little the agent can act on before calibration has idle-gap telemetry (cache lifetime is 0064, compaction timing 0037). Reconsider as a small part of routing calibration if cold restarts prove costly.


`go-getter route --idle <minutes>` (and the same answer in the router hook) tells the agent whether to keep the session cache warm, let it lapse or compact before idling, from the expected cost of a cold restart (cache write at the cache lifetime, 0064) against the cost of keep-alive reads over the gap. go-getter ships no skill or process that pings a model. A host-specific, user-started keep-alive (a scheduled no-op turn) may be documented as a tier 1 procedure where the host offers scheduling, never installed by `apply`.

## Why

Zero-token keep-warm is not possible: only a request that reads the exact prefix refreshes the cache (fact 0028), go-getter owns no model client (0015), and a host's scheduled wake-up costs a full turn that re-reads the context and grows the transcript. At fact 0011 prices for Sonnet 5.5 and a 150k-token prefix a read is $0.03 against $0.375 (5-minute) or $0.60 (1-hour) for a cold write; the saving of keeping warm over a cold restart is the write minus the read ($0.345 or $0.57). With a 5-minute cache about 12 keep-alive reads per hour cost about $0.36, so it pays only for gaps under about an hour; with the 1-hour main-session cache (0064) one read per hour against a $0.60 write pays for gaps up to about 20 hours. Either way it pays only when work resumes, a per-case decision the cost model already prices.

## Tradeoffs considered

- **Pinger skill**: automatic, but burns turns and plan quota when work does not resume.
- **Out-of-host pre-warm through the API**: cheapest per call (no output), but needs credentials and an exact copy of the host's prefix.
- **Cost accepted**: advice depends on the warmth estimates of fact 0025 until calibration (0017).
