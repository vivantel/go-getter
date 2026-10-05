---
id: 0028-prompt-cache-refresh-and-prewarm
title: Each cache hit refreshes the prompt cache lifetime at no charge, and the API can pre-warm a prefix with max_tokens 0
status: active
date: 2026-10-05
tags: [cost, model-routing]
kind: environmental
governed-by: 0064-routing-cache-ttl
expires: 2027-01-04
---

- "The cache is refreshed for no additional cost each time the cached content is used"; the lifetime counts from the start of the request, so response time spends it.
- A request with `max_tokens: 0` pre-warms a prefix: it bills a cache write when the prefix is not cached and no output tokens. Earlier applications used `max_tokens: 1` pings. A 5-minute cache needs a request at least every 5 minutes; for longer gaps the docs recommend the 1-hour cache.
- A cache hit needs the exact prefix, so a pre-warm call from outside a host agent must reproduce that host's system prompt, tools and history (fact 0011: a model switch is a different cache).
- Not confirmed: that any host exposes a pre-warm or keep-alive lever.

Sources (accessed 2026-10-05): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
