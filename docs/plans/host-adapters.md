# Host adapter boundary (L.10) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-11 from an interview with the repo owner (`sergemso`) for backlog item L.10 of `docs/plans/v0.2-agent-core-hardening.md`. Decision: `docs/decisions/0118-extension-architecture-core-and-edges.md`, whose host-adapter paragraph fixes the design; read it first. Runs in parallel with `docs/plans/archive/tracker-backed-plans.md`, which has priority.

## What you are building (read first)

Today a host is spread through the core: per-host branches in `compiler/src/apply.mjs`, per-host renderers in `compiler/src/agents.mjs`, payload parsing in `compiler/src/hook.mjs`, the matrix in `compiler/src/capabilities.mjs` and `compiler/src/coverage.mjs`. This plan makes a host one module behind a registry, so a missing host is one module, one fact and a passing conformance run.

Scope by priority: **Claude Code first, then OpenCode and Kilo** (they share a fork format, fact 0005). Codex, Cursor, Gemini CLI and Copilot are **deferred**: they keep running on today's code, reached through the same registry by a wrapper, with no change in their output.

**Rules the design fixes (do not re-decide):** generated output is byte-identical before and after (the golden and drift checks must not change); the enforcement path stays in-process (no host adapter runs as a separate process in this plan); the registry is internal, not a public contract, and a helper protocol is a later step (0118); a host's unconfirmed shapes stay marked as such in its fact.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `generated-host-files-not-hand-edited`, `neutral-source-has-no-host-specific-language`, `no-runtime-dependencies`. A change here is done only when `npm run check:generated` and `npm test` pass without updating any golden file.

---

### 1 Inventory and the adapter interface — [ ]
Issue: #84
Class: plan · Needs: none · Check: `npm run check:guardrails`
Do: list, for each of the seven hosts, every place the compiler and runtime branch on it (apply outputs, agent renderers, hook config and payload parsing, capability row, coverage row, plugin files, session identity); write the table into a new fact and define the adapter interface from it (what a host answers, what is shared). Mark what the three first hosts need and what the deferred four keep.
Done-when: the fact lists every per-host branch with file and line, and the interface names each answer an adapter gives; nothing in it depends on a helper process.

### 2 Registry, conformance test and the Claude Code adapter — [ ]
Issue: #85
Class: implement · Effort: high · Needs: 1 · Check: `npm run check:generated && npm test`
Do: add the adapter registry and a conformance test that runs every registered adapter through the interface (outputs are deterministic, owned files are marked, a missing capability is reported and never guessed). Move Claude Code's code behind an adapter module; `apply`, `agents`, `hook` and `coverage` reach it through the registry. Leave every other host on its present code through a wrapper adapter.
The registry obeys decision 0119: an adapter takes and returns plain data, with no callbacks and no shared state, and the conformance test checks a JSON round trip.
Done-when: no golden file changes; the conformance test passes for the Claude Code adapter and the wrapper and shows inputs and outputs unchanged by a JSON round trip; `go-getter apply --check` is clean in this repository.

### 3 OpenCode and Kilo adapters — [ ] ‖
Issue: #86
Class: implement · Effort: high · Needs: 2 · Check: `npm run check:generated && npm test`
Do: move OpenCode and Kilo behind adapters sharing one fork base (their agent and plugin formats differ only in paths and the plugin file location, fact 0005).
Done-when: no golden file changes; both pass the conformance test; the Kilo-only differences (the plugin directory, the question tool, fact 0034) live in the Kilo module.

### 4 Deferred hosts on the registry — [ ] ‖
Issue: #87
Class: implement · Needs: 2 · Check: `npm run check:generated && npm test`
Do: register Codex, Cursor, Gemini CLI and Copilot through wrapper adapters that call today's code, mark them `deferred` in the registry, and make `go-getter coverage` say so beside their unconfirmed shapes.
Done-when: no golden file changes; the four hosts pass the conformance test through their wrappers; `coverage` shows them deferred.

### 5 Contributor path — [ ]
Issue: #88
Class: implement · Needs: 3, 4 · Check: `npm run check:guardrails && npm test`
Do: add a fact template for a host's integration surface (what it accepts, what is confirmed and from which source and date, what is not), rewrite `docs/skills/adding-a-host-agent.md` as "write one adapter module, one fact, pass the conformance test", and add a scaffold command or a copyable skeleton module with a failing conformance case that names what is missing.
Done-when: following the procedure from the skeleton produces an adapter that passes the conformance test for a fake host used in the tests; the skill names no step that edits `apply`, `agents` or `hook`.

### 6 Host adapters: docs, lint and close — [ ]
Issue: #89
Class: review · Needs: 5 · Check: `npm run check:plans && npm run check:guardrails`
Do: describe the adapter boundary and the deferred hosts in README and INSTALLING.md, run the full `go-getter:lint` skill, mark L.10 done in the v0.2 plan backlog and archive this plan.
Done-when: lint reports no errors; the plan moves to `docs/plans/archive/`; L.10 reads done.
