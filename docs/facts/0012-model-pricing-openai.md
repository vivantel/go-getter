---
id: 0012-model-pricing-openai
title: OpenAI model pricing including cached input
status: active
date: 2026-10-04
tags: [cost, model-routing, governance]
kind: environmental
governed-by: 0016-quality-gated-cache-aware-model-routing
expires: 2027-01-04
go-getter:
  models:
    - {id: gpt-6-astra, provider: openai, input: 10, cache_read: 1, output: 50, long_context_from: 272000}
    - {id: gpt-6.1-sol, provider: openai, input: 2, cache_read: 0.1, output: 10, long_context_from: 272000}
    - {id: gpt-6-sol, provider: openai, input: 2, cache_read: 0.2, output: 10, long_context_from: 272000}
    - {id: gpt-6-luna, provider: openai, input: 0.1, cache_read: 0.01, output: 0.5, long_context_from: 272000}
    - {id: gpt-5.3-codex, provider: openai, input: 1.75, cache_read: 0.175, output: 14}
    - {id: gpt-5.4-mini, provider: openai, input: 0.75, cache_read: 0.075, output: 4.5}
    - {id: gpt-5.4-nano, provider: openai, input: 0.2, cache_read: 0.02, output: 1.25}
---

Prices in USD per MTok, OpenAI API, Standard tier.

- **Caching**: automatic; cached input billed at the listed `cache_read` rate. No cache-write surcharge is listed (unconfirmed whether writes cost more than input).
- **Long context** (input >272K tokens, gpt-6 family): roughly 2× — gpt-6.1-sol $4 / $0.20 cached / $15; gpt-6-astra $20 / $2 / $75; gpt-6-luna $0.20 / $0.02 / $0.75.
- **Modifiers**: data residency / regional processing +10% for models released on or after 2026-03-05; Priority 2–4×; Batch ~50%.
- Codex config examples reference `gpt-6-luna` and `gpt-6.1-sol` (fact 0004).

Source (accessed 2026-10-04): https://developers.openai.com/api/docs/pricing
