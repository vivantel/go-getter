---
id: 0144-a-spend-cap-on-a-host-without-a-cost-source-warns-and-starts
title: A spend cap on a host with no cost source is reported, not refused; sources are read, never installed
status: active
date: 2026-10-12
tags: [cost, enforcement, host-agents]
track: product
accepted-by: sergemso
---

## Decision

Amends item 6 of 0130 and builds on fact 0037.

1. **A run records its spend from what the host already writes.** A reader per host turns the host's own data (fact 0037) into telemetry records with `cost` and `tokens`; the spend cap of 0130 keeps reading the telemetry log.
2. **A host with no reader cannot bind the cap, and `go-getter run start` says so.** On such a host with a cap set, `run start` prints plainly that the cap cannot bind here, names the stops that still apply (timeout, red attempts, repeated denials, human steps), and starts. It does not refuse. The run record stores that the cap is unmetered and the end-of-run report repeats it instead of printing "$0.00".
3. **A cost source that needs a user-level step is documented, not installed.** go-getter reads transcripts and files the host writes; it does not write a status line or an OpenTelemetry setting for the user (fact 0003: project settings cannot carry OTel; a status line is the user's own).
4. The existing refusal when `telemetry-recording` is not `metadata-log` stays.

## Why

A cap that silently never binds is worse than none (the first dogfood run printed "$0.00 of a $5 cap"), but refusing blocks an AI user who set a cap for the hosts that can meter it and then runs elsewhere; friction in the default path is a defect. Saying it plainly keeps the cap honest without blocking. Not installing user-level wiring keeps go-getter out of settings it does not own.

## Tradeoffs considered

- **Refuse unless acknowledged:** safest for the cap, but a human-only flag on the default path.
- **Refuse always:** makes a project-wide cap unusable the moment one teammate uses another host.
- **Write a project status line:** replaces the user's own and works on one host only.
