# go-getter-init examples

## First setup in a TypeScript repo

**User:** set up the agent harness here

**Agent:** runs `gg detect` → TypeScript, vitest, GitHub Actions, one host agent in use, `.env` present. Runs `gg packs`, recommends the harness packs, user accepts. For the context pack the first question is the always-loaded instruction file cap:

> How large may the always-loaded instruction file be?
> 1. 200 lines (Recommended) — cheapest every turn; forces detail into skills
> 2. 500 lines — more room for rules; costs tokens on every turn

User picks 1 and accepts the recommended defaults for the rest of the pack. The agent asks who is accountable, writes the answers files, shows the dry-run list (two decisions, one guardrail, one INDEX row each), gets a go-ahead, renders, runs `gg apply` and `gg check`, then reports: line cap enforced in CI on every host; also blocked before edits where the host has blocking hooks.

## Detection replaces a question

The governance pack asks which paths are restricted. Detection found `.env` and `config/secrets/`, so the agent says: "I found `.env` and `config/secrets/`; I'll classify them as restricted — correct?" and only asks further if the user adds paths.
