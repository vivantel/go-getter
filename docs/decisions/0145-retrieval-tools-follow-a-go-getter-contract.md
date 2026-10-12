---
id: 0145-retrieval-tools-follow-a-go-getter-contract
title: A retrieval tool follows a go-getter contract (no hooks or MCP entry of its own, go-getter's ignore input, a warm local query daemon); the pack waits for virage to conform
status: active
date: 2026-10-12
tags: [practice-packs, hooks, security]
track: product
accepted-by: sergemso
governed-facts: [0038-virage-integration-surface]
---

## Decision

Supersedes item 4 of 0129 (the `retrieval` pack; items 1 to 3 stand) after the interview for backlog L.15 and fact 0038. The detect-and-coexist rule and the recommended default `virage` of 0129 item 4 no longer apply: coexisting was an interim answer to a tool that writes its own hook and MCP entry, and the default waits for a conforming release.

1. **A retrieval tool conforms to a versioned contract that go-getter defines**, in three parts a tool can meet separately: (a) *index policy*: it registers no hook and no MCP entry of its own, reads a file go-getter generates for the restricted-path ignore globs, the allowed embedder kinds and the data class, and refuses to index outside them; (b) *declaration*: it states the contract version it meets and that it scans for secrets before indexing; (c) *query endpoint*: it offers a warm local endpoint that a go-getter hook can call (not a cold `query` process per prompt, not a pipe owned by another process), which the tool starts and stops itself and announces in a discovery file (address and token); go-getter only calls it and never supervises a process. go-getter owns the hook that puts retrieved chunks into a prompt and the MCP entry, so masking, scanning and the allowlist of 0138 apply to both. Retrieved chunks are untrusted data: the hook frames them as quoted reference material with their source, never as instructions. An unreachable endpoint fails open (nothing injected, one line said); a failed governance check fails closed.
2. **Virage is the first tool and must be changed to conform.** Today it registers an MCP server and a `UserPromptSubmit` hook for Claude Code, has no restricted-path input, no secret scan, and no daemon a hook can reach (fact 0038). Those changes are made in the virage repository, at the owner's timing.
3. **The `retrieval` pack waits entirely** for a virage release that conforms. No detect-only slice ships before it; whether any earlier slice is wanted is an open question for the owner (plan `docs/plans/retrieval-pack.md`).
4. **Only Claude Code is configured**, as virage itself supports only it; other hosts are detected.
5. The rest of what 0129 item 4 committed to stands: restricted paths feed the ignore input, secrets are scanned before indexing, a hosted embedder is refused for internal data, the pack ships only after this repository adopts it, and go-getter never loads the tool's code (0119).

## Why

A retrieved chunk enters the model with no tool call, so a tool that injects its own hook puts content outside every control go-getter has. Coexisting with that hook only reports the gap; owning the hook closes it. A contract keeps the pack provider-neutral: the next retrieval tool meets the same terms. Waiting costs nothing for a repository that does not use virage's injection yet, and avoids a pack that must fight `virage update` for its own files.

## Tradeoffs considered

- **Detect, warn and govern only the index:** ships now, but leaves unseen injection in place.
- **Strip virage's hook after each update:** works today, but re-fights the tool on every update.
- **MCP-only contract:** simplest, cannot cover prompt injection.
- **Library contract:** conflicts with 0119.
- **Cost accepted:** nothing ships for retrieval until virage changes; the contract file names, fields and endpoint protocol are fixed in 0146.
