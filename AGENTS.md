# AGENTS.md

Guidance for AI agents working in this repository.

## What this repo is

go-getter sets up the **agent harness** (the 12 components around a model: orchestration, tools, sandbox, context, memory, verification, guardrails/DLP, human-in-the-loop, checkpointing, multi-agent, cost & model routing, observability) and SDLC practices for a project, by configuring **host agents** (Claude Code, Codex, Kilo/OpenCode, Cursor, Gemini CLI, Copilot). "Harness" never means a host agent. See `docs/decisions/0001-go-getter-product-scope-and-name.md` and `docs/facts/0002-agent-harness-and-host-agent-terminology.md`.

## Knowledge base

Decisions, facts, guardrails and procedures live in `docs/` in kms format:

- `docs/{facts,decisions}/NNNN-slug.md` (next free number), `docs/{guardrails,skills}/slug.md`.
- Frontmatter `id, title, status, date, tags`; tags only from `docs/skills/tags.md`.
- Add a row to the directory's `INDEX.md` for every new artifact.
- Committed decisions are immutable: supersede, don't edit.
- Machine-readable data goes under the `go-getter:` frontmatter key; every guardrail has `go-getter.enforcement`.

Read the guardrails in `docs/guardrails/` before changing code they govern.

## Workflow (interim, until the git-workflow pack replaces it — decision 0004)

- Never push to `main`. Short-lived branch `type/slug` → PR → squash merge.
- Conventional Commit titles; `Refs:` trailers to the `docs/` artifacts a change implements.
- One git worktree per parallel task: `git worktree add ../go-getter-wt/<slug> -b <branch>`.

## Remaining work

Step status lives in `docs/plans/bootstrap-go-getter.md`. Update the markers as you go.
