---
id: 0011-model-pricing-anthropic
title: Anthropic Claude model pricing including cache economics
status: active
date: 2026-10-04
tags: [cost, model-routing, governance]
kind: environmental
governed-by: 0016-quality-gated-cache-aware-model-routing
expires: 2027-01-04
go-getter:
  models:
    - {id: claude-fable-5-1, provider: anthropic, input: 10, cache_write_5m: 12.5, cache_write_1h: 20, cache_read: 0.25, output: 50, min_cache_tokens: 512}
    - {id: claude-opus-5-5, provider: anthropic, input: 4, cache_write_5m: 5, cache_write_1h: 8, cache_read: 0.2, output: 20, min_cache_tokens: 512}
    - {id: claude-opus-5, provider: anthropic, input: 5, cache_write_5m: 6.25, cache_write_1h: 10, cache_read: 0.5, output: 25, min_cache_tokens: 512}
    - {id: claude-sonnet-5-5, provider: anthropic, input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10, min_cache_tokens: 512}
    - {id: claude-sonnet-5, provider: anthropic, input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10, min_cache_tokens: 1024}
    - {id: claude-haiku-4-5, provider: anthropic, input: 1, cache_write_5m: 1.25, cache_write_1h: 2, cache_read: 0.1, output: 5, min_cache_tokens: 4096}
---

Prices in USD per million tokens (MTok), Claude API, standard tier.

- **Cache multipliers on base input**: 5-minute write 1.25×, 1-hour write 2×, read 0.1× — except Fable 5.1 (read 0.025×) and Opus 5.5 (read 0.05×). A 5m write pays off after one read; a 1h write after two.
- **Cache scope**: exact-prefix match, per workspace (Claude API, Claude Platform on AWS, Foundry); organization-level on Bedrock and Google Cloud. Switching model means a different prefix (Claude Code treats each model as its own cache, fact 0003). Up to 4 breakpoints.
- **Minimum cacheable prefix**: 512 tokens (Fable 5/5.1, Opus 5/5.5, Sonnet 5.5), 1,024 (Sonnet 5, Opus 4.8), 2,048 (Opus 4.7), 4,096 (Haiku 4.5, Opus 4.5/4.6); shorter prompts are silently uncached.
- **Long context**: Claude 4.6+ models have a 1M window at standard per-token rates.
- **Modifiers** (stack with caching): Batch −50%; US-only inference (`inference_geo: "us"`) 1.1× on all token categories; Bedrock/Google regional endpoints +10%; fast mode Opus 5.5 $8/$40.
- **Tokenizer**: Claude 4.7+ produce ~30% more tokens for the same text than Sonnet 4.6 and earlier — compare costs per task, not per token.
- **Tool overhead**: ~286 system-prompt tokens when tools are present (Opus/Sonnet 5.5).

Sources (accessed 2026-10-04): https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/build-with-claude/prompt-caching
