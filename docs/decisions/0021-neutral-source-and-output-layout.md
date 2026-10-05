---
id: 0021-neutral-source-and-output-layout
title: Neutral source, compiler and per-host output layout
status: active
date: 2026-10-04
tags: [architecture, compiler, generated-files, packaging]
track: process
accepted-by: sergemso
governed-facts: [0009-host-capability-matrix]
---

## Decision

### Repository layout

```
src/                         neutral source (authored)
  skills/<name>/SKILL.md     Agent Skills format: name, description (+ license, compatibility, metadata)
  agents/<role>.md           neutral role definitions (frontmatter: name, description, tools, task-class, readonly)
  commands/<name>.md         neutral commands (compiled to skills where a host has no commands)
  rules/<name>.md            instruction fragments for AGENTS.md generated sections
  packs/<id>/pack.json       practice packs (0008)
compiler/
  bin/go-getter.mjs          CLI entry (build, check, detect, render-pack, apply, route, verify, ...)
  src/                       parsing, rendering, checks/, routing/, telemetry/
  adapters/<host>.mjs        one emitter per host
  capabilities/<host>.json   per-host capabilities (from fact 0009)
  schemas/                   JSON Schemas (capabilities, pack)
  test/                      node:test suites and fixtures
vendor/kms/ + vendor/kms.lock.json   vendored kms (0006)
scripts/                     repo maintenance scripts (sync-kms.mjs)
evals/                       behavior evals (0013)
```

Hosts: `claude-code`, `codex`, `kilo`, `opencode`, `cursor`, `gemini-cli`, `copilot`.

### Output kind A — distributable packaging (committed in this repo)

| Host | Files |
|-|-|
| Claude Code | `.claude-plugin/marketplace.json` → `plugins/go-getter/.claude-plugin/plugin.json` (component paths into `skills/`, `hosts/claude-code/`) |
| Codex | `.agents/plugins/marketplace.json` → `plugins/go-getter/.codex-plugin/plugin.json` (skills, hooks; Codex plugins carry no agents) |
| Cursor, Copilot | `plugins/go-getter/plugin.json` in Agent Plugins 1.0 format, host specifics under `extensions` / `hosts/<host>/` |
| Kilo | `plugins/go-getter/skills/index.json` (remote-skills manifest, as kms) |
| OpenCode | the shared `plugins/go-getter/skills/` only (no remote-skills manifest documented) |
| Gemini CLI | `gemini-extension.json` at repo root (installed by GitHub URL), pointing into `plugins/go-getter/` |

Shared: `plugins/go-getter/skills/` holds compiled skills once for all hosts. Host-only components (agent definitions, hook configs) live in `plugins/go-getter/hosts/<host>/`.

### Output kind B — project-local files (`init` / `apply` in an adopting project, incl. this repo)

| Concern | Files |
|-|-|
| Instructions | `AGENTS.md` generated section; `CLAUDE.md` → `AGENTS.md` symlink; Gemini `context.fileName: ["AGENTS.md"]` in `.gemini/settings.json` |
| Skills | `.agents/skills/` canonical; `.claude/skills` → `.agents/skills` symlink |
| Agents | `.claude/agents/*.md`, `.codex/agents/*.toml`, `.opencode/agents/*.md` or `.kilo/agents/*.md`, `.cursor/agents/*.md`, `.gemini/agents/*.md`, `.github/agents/*.agent.md` |
| Host hooks & permissions | `.claude/settings.json`, `.codex/hooks.json` + `.codex/config.toml`, `.opencode/plugins/go-getter.js` or `.kilo/...`, `.cursor/hooks.json`, `.gemini/settings.json` + `.gemini/policies/` (user tier: workspace policies disabled), `.github/hooks/go-getter.json` |
| Tier 3 | `.githooks/*` (+ `git config core.hooksPath .githooks`), `.github/workflows/go-getter-checks.yml` |
| Runtime state | `.go-getter/state/` (gitignored) |

`init` asks which hosts the project uses (prefilled from detection) and emits only those.

### Symlinks

Emitted only for byte-identical files (`CLAUDE.md`, `.claude/skills`). `--copy` (and automatically on Windows without symlink support) writes copies; the drift check then compares contents.

## Why

Fact 0009 shows instructions and skills can be shared across hosts while agents and hooks cannot; one plugin directory with shared skills and per-host subtrees keeps a single source and avoids file-name clashes between hosts.

## Tradeoffs considered

- **One plugin directory per host**: simplest manifests, but skills duplicated six times.
- **Everything at repo root**: fewer paths, but host conventions collide (e.g. two `plugin.json` meanings).
- **Unconfirmed points to validate in the adapters (plan 2.4)**: whether Codex's portable root `plugin.json` equals Agent Plugins 1.0; Kilo's `.kilo/` subdirectory names; whether Gemini's extension manifest may point outside the repo root.
