---
id: 0142-the-helper-protocol-waits-for-a-real-need
title: The helper protocol waits for a second implementation or an external request; our own trust steps do not trigger it
status: active
date: 2026-10-12
tags: [architecture, roadmap]
track: product
accepted-by: sergemso
---

## Decision

Amends the build triggers of 0119 and item 4 of 0140. The helper protocol is built only when **a second implementation of a kind exists, or a third party asks to write one**. The third trigger of 0119, "the trust steps of L.9 exist", is dropped: those steps are written by this project, so counting them would start the protocol on no outside need.

Backlog item L.18 (the protocol plan) therefore waits for one of the two triggers, and its `Human:` field says so. The same applies to the speculative parts of the neighbouring plans: foreign pack vendoring and the author guide (`docs/plans/third-party-packs.md` steps 3 to 5) and the MCP server (`docs/plans/mcp-server.md`) start when someone asks for them, not when they are next in order. The budgets of `third-party-packs` steps 1 and 2 improve the existing Jira and GitHub sources and are not held.

## Why

A protocol designed from one implementation, or before anyone needs it, is the failure 0118 warns about, and each extension surface is maintenance for a product whose job is configuring host agents. Holding the speculative work keeps focus on what has a demonstrated gap: governing MCP calls and the token cost of existing sources.

## Tradeoffs considered

- **Keep the self-triggering trust-step trigger:** the protocol would be planned as soon as the vendoring lands, with no user.
- **Delete the speculative plans:** loses the design; holding them keeps it cheap to resume.
- **Cost accepted:** a third party who arrives finds the work not started and waits for its plan to run.
