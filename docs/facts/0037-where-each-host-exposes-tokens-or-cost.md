---
id: 0037-where-each-host-exposes-tokens-or-cost
title: Only Claude Code (transcript, status line, -p JSON), Codex (exec JSON) and OpenCode and Kilo (session export) give a per-session source of tokens or cost; Cursor, Gemini CLI and Copilot give none
status: active
date: 2026-10-12
tags: [cost, hooks, host-agents]
kind: environmental
governed-by: 0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops
last-verified: 2026-10-12
---

No host's hook payload carries per-turn tokens or cost, so a run's spend (read from the telemetry log, decision 0130 item 6) needs a reader of another source. "Confirmed" = a vendor page (accessed 2026-10-12) or observed on this machine the same day; "unconfirmed" = not found in the docs checked.

| Host | Hook payload | File or command a hook can read | Headless | Export | Cost in USD? |
|---|---|---|---|---|---|
| claude-code | none, except resumed `SessionStart`: `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd` (confirmed; already recorded, 0087) | every hook names `transcript_path` (confirmed); the JSONL holds `message.usage` per assistant message (input, output, cache read and write, 5m/1h split; **observed, not in the vendor docs**; same message may repeat, key by `message.id`). Status line command gets `cost.total_cost_usd` (session, client-side at list price, resets on `/clear`) and `transcript_path` (confirmed) | `-p --output-format json`: `total_cost_usd`, `usage`; `--max-budget-usd` (print mode) | OTel `claude_code.cost.usage`, `claude_code.token.usage` (user or managed settings only) | yes (status line, `-p`, OTel); transcript gives tokens, price them with the routing tables |
| codex | none (confirmed) | `transcript_path` (confirmed; vendor says the format "isn't a stable interface"); usage fields in it unconfirmed | `exec --json`: `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens` (fact 0004); no cap | `[otel]` token counts, user config only | no: tokens, priced with the routing tables |
| kilo | none documented | `kilo session list --format json` (id, updated, directory) and `kilo export <id>`: JSON `messages[].info` of each assistant message has `cost`, `tokens.{input,output,reasoning,cache.read,cache.write}`, `modelID`, `time.{created,completed}` (**observed 2026-10-12**, kilo 7.6.2, same shape as OpenCode); `kilo stats` prints totals only | `run --format json` usage fields unconfirmed; no cap | `OTEL_EXPORTER_OTLP_ENDPOINT` traces and logs, content unconfirmed | yes where the provider reports a price (observed `cost` 0 for a free model, so tokens priced from the price facts instead) |
| opencode | none documented (event payloads not listed in the plugin docs) | `opencode session list --format json` and `opencode export <id>`: the same `messages[].info` fields as Kilo (**observed 2026-10-12**, opencode 1.18.35); each call starts the host (about 2 s), so read at a step boundary, not per tool call; `opencode stats [--days N]` prints totals only | `run --format json` usage fields unconfirmed; no cap | none documented | as kilo |
| cursor | none (confirmed: `stop`, `sessionEnd`, `postToolUse`, `afterAgentResponse` carry status, duration and model only) | `transcript_path` is a common field (null when transcripts are off); format unspecified | `agent -p --output-format json` usage unconfirmed (fact 0006); no cap | none | no source |
| gemini-cli | `AfterModel` `llm_response.usageMetadata.totalTokenCount` (docs show a total only, not split by cache state, 0087) | `transcript_path` "session transcript JSON"; whether it holds usage unconfirmed | headless usage fields unconfirmed; no cap | `telemetry.enabled`: `gemini_cli.token.usage` (input, output, thought, cache, tool); no cost metric; `logPrompts` defaults true | no: tokens only, total only in the hook |
| copilot | none (confirmed) | `transcriptPath` only on `agentStop`, `subagentStop`, `subagentStart`, `preCompact`; contents unconfirmed | `--output-format json` JSONL: usage fields unconfirmed; `--max-ai-credits N` caps autopilot spend and the CLI reports "credits used against the cap" in a panel | none documented | credits, not USD; no readable figure found |

## What follows

- **Per-run spend can be read today on claude-code** (transcript tokens priced by the price facts), **on opencode and kilo** (session export, summed over the project's sessions touched since the run began, so another session in the same directory is counted too), and on codex only after a format check (no Codex here to check). Cursor, Gemini CLI and Copilot have no confirmed source. Subagent transcripts of Claude Code are not read: no subagent file was present to check, so a run's figure is a lower bound there.
- The `--headless-flags` spend cap exists only on claude-code (`--max-budget-usd`) and copilot (`--max-ai-credits`) and applies to a headless call, not to an interactive run.
- Prices come from the model price facts (0011 to 0013); a host-reported price (`cost.total_cost_usd`, `stats`) is at list price and can differ from the bill, and a flat-rate subscription has no per-token bill at all, so the figure is an estimate that caps a run's use, not an invoice.

## Not confirmed

Checked 2026-10-12 only where the host is installed (claude-code, opencode, kilo). Not installed here, so still unconfirmed: Codex transcript usage fields; Cursor, Gemini CLI and Copilot transcript contents and headless JSON usage; `run --format json` usage on any host. Also unconfirmed: whether Claude Code's transcript usage shape is stable (it is undocumented), and where its subagent usage is written.

## Sources (accessed 2026-10-12)

https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/statusline · https://code.claude.com/docs/en/costs · https://learn.chatgpt.com/docs/hooks · https://geminicli.com/docs/hooks/reference · https://cursor.com/docs/hooks · https://docs.github.com/en/copilot/reference/hooks-configuration · https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference · https://opencode.ai/docs/plugins · https://kilo.ai/docs/code-with-ai/platforms/cli · local `opencode stats --help`, `kilo stats --help` and a Claude Code transcript.
