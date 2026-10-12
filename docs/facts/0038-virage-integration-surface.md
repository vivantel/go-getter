---
id: 0038-virage-integration-surface
title: Virage registers MCP and hooks only for Claude Code; its prompt hook injects retrieved chunks without a tool call; it has no secret scan and no restricted-path input
status: active
date: 2026-10-12
tags: [tooling, security, hooks]
kind: environmental
governed-by: 0145-retrieval-tools-follow-a-go-getter-contract
last-verified: 2026-10-12
---

Read from source in the local checkout of github.com/vivantel/virage (commit 791482ee, tag `virage-chunker-ce-ast@v0.1.36-1`; `virage-agent-claude` plugin 0.2.4), not by running it. **Confirmed** = read in source or docs there; **unconfirmed** = not found or not run.

## What `virage init` and `virage update` write (confirmed)

- `virage.config.json` (V2: `providers.{embedder,vectorStore,reranker,source}`, `fileSets[]` with `include`/`ignore`, top-level `ignore`), the `.virage/` directory (index store, local plugins `.virage/plugins/`), and `~/.virage/plugins/` for a global install.
- Git hooks `post-merge` and `post-checkout` in `.git/hooks/`, appended to any existing hook behind the marker comment `# Added by virage install-hooks` (`virage install-hooks [--uninstall]`; `virage init` offers them).
- Per agent plugin, `configure(targetDir)` runs at init and at every `virage update`. The base class copies the plugin's `plugin-config/` files (slash commands, skills) to `.claude/skills/virage` (Claude Code), `.github/copilot` (Copilot), `.codex` (Codex) or `.antigravity` (Antigravity). Whether Codex or Copilot read those directories is unconfirmed.
- **Claude Code only** also (a) registers an MCP server named `virage` in the project `.mcp.json` (`claude mcp add virage --scope project -- npx -y @vivantel/virage-agent-claude@latest`, fallback: edits `.mcp.json` directly; removes a stale `virage-agent` entry) and (b) merges a hook into `.claude/settings.json` (`UserPromptSubmit`, command text containing `inject-context`, `statusMessage` starting `[Virage]`). The Codex, Copilot and Antigravity plugins define no `configure()` of their own, so they register no MCP server and no live hook; their shipped `hooks.json` only echoes a skill-standard reminder.
- `virage uninstall` removes the git hooks, `.virage/plugins/`, `~/.virage/plugins/`, the `.virage/` store, `virage.config.json` and optionally the global CLI; it does not mention `.mcp.json` or `.claude/settings.json`, so the MCP entry and the prompt hook are left behind (unconfirmed by running).

## MCP surfaces

- `@vivantel/virage-agent-claude` serves seven tools under the server name `virage`: `list_skills`, `read_skill_summary`, `read_skill`, `suggest_skill`, `search`, `onboard`, `session_usage`. Claude Code and Codex show these as `mcp__virage__<tool>` (fact 0036). `session_usage` parses the Claude Code session log. None of the tools is marked read-only in source (no annotations), so under decision 0138 every one counts as a write unless listed in `mcp-read-tools`.
- The Rust engine has a separate stdio MCP (`virage serve`; tools `search_chunks`, `browse_chunks`, `get_stats`). An unauthenticated HTTP mode is refused in source. Which host config, if any, registers it is unconfirmed.

- **Daemons** (confirmed in `crates/virage-engine/src/cli/{serve,query_serve}.rs`): `virage serve` speaks MCP over stdio only; its `--transport http` exits with an error unless a serve extension is installed (an unauthenticated HTTP server is refused). `virage query-serve` is a hidden, warm, session-scoped query daemon: newline-delimited JSON requests in on stdin, the JSON row array of `virage query --format json` (or `{"error": ...}`) out, started and owned by a parent process (the Claude plugin's MCP server) and ended by stdin EOF, because the embedder's cold start is about 30 seconds. No machine-wide daemon with an idle timeout was found in this checkout. A short-lived hook process therefore has no daemon to ask: it can only start `virage query` (cold start) or go through the MCP server's own child.

## Hook behaviour that matters to go-getter

- `inject-context` runs on every Claude Code prompt: it searches the index with the first 400 characters of the prompt (top 5, similarity at least 0.65, 2000-token budget, 800 characters per chunk) and prints the chunks into the context. **This is retrieved content entering the model without a tool call**, so no pre-tool or MCP hook sees it; the only control is what is in the index.
- It fails open (`|| true`) and is not path-aware.

## Index content and governance (confirmed absent unless stated)

- Inclusion is by `fileSets[].include` and `ignore` globs plus top-level `ignore`. Whether `.gitignore` is honoured is unconfirmed. There is no restricted-path input: go-getter would have to write the ignore list.
- No secret scan before indexing was found in the docs or the CLI source read.
- Embedders: local (`onnx` built into the binary, `fastembed`, `transformers`) and hosted (`openai`, key or compatible endpoint). Stores: embedded (LanceDB local directory, the likely default) and hosted or networked (LanceDB Cloud, Qdrant, Postgres, ChromaDB). A hosted embedder sends chunk text off the machine.

## Not confirmed

Running `virage init` in a scratch project to compare the files written with this list; the exact `.claude/settings.json` hook shape written (matcher, timeout); whether `.gitignore` is honoured; whether the engine MCP is registered anywhere; whether a pre-existing `.mcp.json` or hook entry of go-getter's own survives `virage update` (the code merges by key, so it should).

## Sources

`docs/cli/{init,update,install-hooks,uninstall,index,config}.md`, `docs/packages/{embedders,stores}.md`, `docs/decisions/ADR-025-universal-agent-hook-base.md`, `packages/virage-agent-claude/src/{plugin,server,inject-context}.ts`, `packages/virage-agent-core/src/{base/base-agent,constants/vendor-configs}.ts`, `crates/virage-engine/src/{mcp,cli/serve}.rs` in the virage repository (read 2026-10-12).
