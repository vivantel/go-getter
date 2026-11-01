---
id: 0154-throughput-is-measured-in-human-minutes-per-merged-outcome
title: Throughput is measured in human minutes per merged outcome, with a 5-10x floor and a 50x stretch
status: active
date: 2026-11-01
tags: [roadmap, dogfooding, cost]
track: process
accepted-by: sergemso
---

## Decision

The workflow goal is measured as **human minutes per merged outcome**, not output per day or wall-clock per feature. A merged outcome is a squashed PR that passed its gates (0158). The baseline is 2026-10-31 (fact 0040): about 45 man-hours of conventional work for about 20 h of owner attention. The floor we commit to is 5-10x fewer human minutes for the same outcome and quality; 50x is the stretch. Quality is held constant: no gate is dropped to gain speed (0158).

## Why

Only the owner's attention is moved by workflow changes; CI time, review depth and decision latency do not scale to 50x output per day. Measuring attention keeps the target honest and gives every later decision (0155-0158) a common yardstick. The metric is produced by a deterministic report (plan `docs/plans/throughput-50x.md`, step 1), never by an agent's estimate.
