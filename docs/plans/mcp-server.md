# go-getter as an MCP server (L.12) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-12 from an interview with the repo owner (`sergemso`) for backlog item L.12 (`docs/plans/backlog.md`, issue #94). Decision: `docs/decisions/0139-go-getter-serves-adopted-pack-verbs-as-read-only-mcp-tools-over-stdio.md`; read it first, it fixes the design. It sits on `docs/decisions/0119-helper-contract-v0.md` (a separate surface) and `docs/decisions/0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md` (the allowlist that lists this server).

## What you are building (read first)

`go-getter mcp serve`, a stdio MCP server whose tools are the read-only verbs the project's adopted packs declare:

- **The server** with `initialize`, `tools/list` and `tools/call` over JSON-RPC on stdio, no dependency (step 1).
- **Pack tool declarations** in the pack format and the never-list test (step 2), then **the tools themselves** (step 3).
- **Wiring** as an opt-in answer that `apply` writes into each host's MCP configuration (step 4), and adoption (step 5).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `no-runtime-dependencies`, `owned-files-never-clobbered`, `generated-host-files-not-hand-edited`, `neutral-source-has-no-host-specific-language`, `restricted-paths-denied`, `telemetry-records-metadata-only`.

**Rules the design fixes (do not re-decide):** version 1 ships read tools only, enforced by a fixed read-only function list at run time; `run start|end`, `approvals add|allow|revoke` and `secret` are never exposed; stdio only; off by default; a tool prints what its CLI verb prints after the secret and personal-data check; the tools listed are those of adopted packs only.

---

### 1 The stdio server — [ ]
Issue: #176
Class: implement · Effort: high · Needs: none · Human: start when a host or user asks for it (decision 0142) · Check: `node --test compiler/test/mcp-serve.test.mjs`
Do: add `go-getter mcp serve`: line-delimited JSON-RPC 2.0 on stdin and stdout answering `initialize`, `ping`, `tools/list` and `tools/call`, with protocol errors for unknown methods, bad input and unknown tools; tools come from a registry the next steps fill. Nothing is written to stdout except protocol messages.
Done-when: tests drive the server through a pipe and show the handshake, an empty tool list, an unknown method and an unknown tool answered with errors, and stdout holding only valid messages.

### 2 Pack tool declarations and the never-list — [ ]
Issue: #177
Class: implement · Effort: medium · Needs: 1 · Check: `node --test compiler/test/mcp-declarations.test.mjs`
Do: add an optional `mcp` section to the pack format (name, description, input schema of ids and enumerated values only, a named read-only function, class `read|write`) with schema validation; the registry lists the tools of the adopted packs only and refuses at load any declaration whose function is not on the fixed in-code list of read-only functions (so a vendored pack cannot widen it); a test guards the list against `run start|end`, `approvals`, `secret` and every writing verb, and fails if a shipped tool is not `read`.
Done-when: tests show a pack's tools listed when adopted and absent when not, an invalid declaration rejected, a declaration naming a writing verb or a path input refused, and the read-only list enforced.

### 3 The read tools — [ ]
Issue: #178
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/mcp-tools.test.mjs`
Do: declare and serve, in the owning packs, plan status and next, refs, coverage, run status and next, and reading the knowledge base (list and get decisions, facts, guardrails and skills); each verb's logic is refactored where needed into a function that returns data (the CLI prints it, the server returns it), because the CLI verbs print and return exit codes and would corrupt the protocol stream; output passes stateless masking (a label per kind, no numbering), and inputs are ids resolved under `docs/` and `docs/plans/`, never paths.
Done-when: tests show each tool returning the same data its CLI verb prints, nothing but protocol messages on stdout, a secret in a result masked, a path or `../` input refused, and a project without the pack not offered the tool.

### 4 Opt-in wiring — [ ]
Issue: #179
Class: implement · Effort: high · Needs: 2 · Check: `npm run check:generated && node --test compiler/test/mcp-wiring.test.mjs`
Do: add the `mcp-server` answer (default off; pack home `orchestration` unless the build finds a better one); with it on, `apply` writes the server entry in each host's MCP configuration (found from step 1 of `docs/plans/archive/mcp-governance.md`), owned and removable, and the allowlist of 0138 lists `go-getter` when that answer exists, with its tools classed `read` from their pack declarations. Start this step only after steps 2 and 3 of `docs/plans/archive/mcp-governance.md` are done (the allowlist and the classes); the hosts' MCP configuration locations come from step 1 of that plan. Hosts whose configuration is unconfirmed are marked so in their fact.
Done-when: tests show the entry written, removed on update or when the answer is off, not hand-editable by the owned-files rule, and the allowlist listing `go-getter` automatically.

### 5 Adopt, document and dogfood — [ ]
Issue: #180
Class: implement · Effort: medium · Needs: 3, 4 · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the answer in this repository, regenerate, describe the server in INSTALLING.md and the README, call it once from a host that reads project MCP configuration, and record in the plan's result line what was friction.
Done-when: the checks pass and the plan's result line states what was found.
