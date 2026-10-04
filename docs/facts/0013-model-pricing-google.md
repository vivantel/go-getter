---
id: 0013-model-pricing-google
title: Google Gemini API model pricing including context caching
status: active
date: 2026-10-04
tags: [cost, model-routing, governance]
kind: environmental
governed-by: 0016-quality-gated-cache-aware-model-routing
expires: 2026-12-31
go-getter:
  models:
    - {id: gemini-3.1-pro-preview, provider: google, input: 2, cache_read: 0.2, output: 12, storage_per_hour: 4.5, long_context_from: 200000, preview: true}
    - {id: gemini-3.8-flash, provider: google, input: 0.75, cache_read: 0.075, output: 3.75, storage_per_hour: 0.5}
    - {id: gemini-3.5-flash, provider: google, input: 1.5, cache_read: 0.15, output: 9, storage_per_hour: 1}
    - {id: gemini-3.5-flash-lite, provider: google, input: 0.3, cache_read: 0.03, output: 2.5, storage_per_hour: 1}
    - {id: gemini-3.1-flash-lite, provider: google, input: 0.25, cache_read: 0.025, output: 1.5, storage_per_hour: 1}
    - {id: gemini-2.5-pro, provider: google, input: 1.25, cache_read: 0.125, output: 10, storage_per_hour: 4.5, long_context_from: 200000}
---

Prices in USD per MTok, Gemini API paid tier, text input.

- **Scheduled increase**: Gemini 3.6/3.7/3.8 Flash prices are valid through 2026-12-31 and **double on 2027-01-01** (e.g. 3.8 Flash $1.50 / $0.15 cached / $7.50) — hence this fact expires 2026-12-31.
- **Long context** (>200K prompt): 3.1 Pro $4 / $0.40 cached / $18; 2.5 Pro $2.50 / $0.25 / $15.
- **Context caching** bills per-token reads plus hourly storage per MTok. Gemini CLI caches automatically only with API key or Vertex AI auth, not OAuth (fact 0007).
- **Data use**: free tier — "Content used to improve our products"; paid tier — not used. Relevant to data classes (decision 0018).
- **Modifiers**: Batch ~50%; Flex and Priority tiers exist.

Source (accessed 2026-10-04): https://ai.google.dev/gemini-api/docs/pricing
