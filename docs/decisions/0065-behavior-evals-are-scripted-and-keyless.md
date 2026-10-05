---
id: 0065-behavior-evals-are-scripted-and-keyless
title: The first behavior evals run init with scripted answers, with no model and no API key
status: active
date: 2026-10-05
tags: [verification, eval, ci]
track: process
accepted-by: sergemso
---

## Decision

Layer 3 of decision 0013 starts as deterministic promptfoo cases (`evals/promptfooconfig.yaml`). Each case copies a fixture repo (Node, Python, empty, sensitive paths), adopts packs with the recommended answers through `render-pack` and `apply`, and asserts on the result: artifacts exist, frontmatter and tags are valid, INDEX rows exist, tier-3 checks pass, `apply --check` is stable, neutral artifacts name no host agent, every detected sensitive path is in the restricted-paths guardrail. A routing case compares total expected step cost with routing off (the session model) and on (the router's pick) under the same verification gate and failure rates.

CI needs no secret: `promptfoo` is a pinned devDependency and the cases call no model.

Model-driven cases (an agent following the interview on a host) are deferred until a host and a free or keyed model are chosen; they extend this suite and still gate releases only.

## Why

The compiler and renderer are the part that breaks silently across seven hosts, and they are deterministic, so a model adds cost and flakiness without adding signal. This also resolves the plan's open question on eval authentication without asking for a secret.

## Tradeoffs considered

- **Model-driven cases first** (free Kilo gateway models): tests interview-following, but slow, flaky and dependent on an unconfirmed free tier.
- **Cost accepted**: nothing yet checks that a host agent asks the questions as written; the routing case measures expected cost from the cost model, not measured spend.
