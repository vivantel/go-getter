# Host adapter boundary — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Split out of the former single `roadmap.md` on 2026-11-03 (decision 0165, plan `work-coordination.md`). Step text, ids and issue numbers are unchanged. The product-level index is `docs/plans/roadmap.md`. `Needs` lists ids in this plan only; a dependency on another plan is written in the step's Context until `work-coordination.md` step K1 makes `plan#id` parse. Live state of a step follows decision 0166 once K2 lands; until then update the marker and `Progress` line in place as before.

## Phase 2 — Host adapter boundary

Decision `docs/decisions/0118-extension-architecture-core-and-edges.md` (host-adapter paragraph) fixes the design; read it first. A host is spread through the core today: per-host branches in `compiler/src/apply.mjs`, renderers in `agents.mjs`, payload parsing in `hook.mjs`, the matrix in `capabilities.mjs` and `coverage.mjs`. This phase makes a host one module behind a registry. Scope: Claude Code first, then OpenCode and Kilo (shared fork format, fact 0005); Codex, Cursor, Gemini CLI and Copilot are deferred, reached through the registry by a wrapper with no change in output.

**Rules the design fixes (do not re-decide):** generated output is byte-identical before and after (golden and drift checks must not change); the enforcement path stays in-process; the registry is internal, not a public contract (0118); a host's unconfirmed shapes stay marked in its fact. A step is done only when `npm run check:generated` and `npm test` pass without updating any golden file.

### H2 Registry, conformance test and the Claude Code adapter — [x]
Issue: #85
Class: implement · Effort: high · Needs: none · Check: `npm run check:generated && npm test`
Do: add the adapter registry and a conformance test that runs every registered adapter through the interface (outputs are deterministic, owned files are marked, a missing capability is reported and never guessed). Move Claude Code's code behind an adapter module; `apply`, `agents`, `hook` and `coverage` reach it through the registry. Leave every other host on its present code through a wrapper adapter. The registry obeys decision 0119: an adapter takes and returns plain data, with no callbacks and no shared state, and the conformance test checks a JSON round trip.
Done-when: no golden file changes; the conformance test passes for the Claude Code adapter and the wrapper and shows inputs and outputs unchanged by a JSON round trip; `go-getter apply --check` is clean in this repository.
Result: `compiler/src/hosts/` holds the registry, the Claude Code adapter and a wrapper for the other six hosts (operations `describe`, `agent`, `hookSettings`, `projectFiles`, `respond`, `respondPostTool`; an unsupported one answers `{ missing }` and the core keeps its own code). `apply`, `agents`, `hook` and `coverage` reach Claude Code through it; `compiler/test/hosts/conformance.test.mjs` checks every host. No golden file changed.

### H3 OpenCode and Kilo adapters — [x] ‖
Issue: #86
Class: implement · Effort: high · Needs: H2 · Check: `npm run check:generated && npm test`
Do: move OpenCode and Kilo behind adapters sharing one fork base (their agent and plugin formats differ only in paths and the plugin file location, fact 0005).
Done-when: no golden file changes; both pass the conformance test; the Kilo-only differences (the plugin directory, the question tool, fact 0034) live in the Kilo module.
Result: `compiler/src/hosts/fork-base.mjs` holds the shared agent renderer and operations; `opencode.mjs` and `kilo.mjs` register on it. Kilo's plugin directory, its post-tool answer (fact 0031) and the question-tool gate (fact 0034) are in `kilo.mjs`. The plugin file text stays in `apply` (no operation covers it yet). No golden file changed.

### H4 Deferred hosts on the registry — [x] ‖
Issue: #87
Class: implement · Needs: H2 · Check: `npm run check:generated && npm test`
Do: register Codex, Cursor, Gemini CLI and Copilot through wrapper adapters that call today's code, mark them `deferred` in the registry, and make `go-getter coverage` say so beside their unconfirmed shapes.
Done-when: no golden file changes; the four hosts pass the conformance test through their wrappers; `coverage` shows them deferred.
Result: the four wrappers in `compiler/src/hosts/registry.mjs` describe themselves with `status: 'deferred'` (`deferredHosts()`); `go-getter coverage` prints a `Deferred hosts:` line beside the table. No golden file changed.

### H5 Contributor path — [ ]
Issue: #88
Class: implement · Needs: H3, H4 · Check: `npm run check:guardrails && npm test`
Do: add a fact template for a host's integration surface (what it accepts, what is confirmed and from which source and date, what is not), rewrite `docs/skills/adding-a-host-agent.md` as "write one adapter module, one fact, pass the conformance test", and add a scaffold command or a copyable skeleton module with a failing conformance case that names what is missing.
Done-when: following the procedure from the skeleton produces an adapter that passes the conformance test for a fake host used in the tests; the skill names no step that edits `apply`, `agents` or `hook`.

### H6 Host adapters: docs and lint — [ ]
Issue: #89
Class: review · Needs: H5 · Check: `npm run check:plans && npm run check:guardrails`
Do: describe the adapter boundary and the deferred hosts in README and INSTALLING.md and run the full `go-getter:lint` skill.
Done-when: lint reports no errors and the README and INSTALLING.md describe the boundary.
