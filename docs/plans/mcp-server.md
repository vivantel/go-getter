# go-getter as an MCP server — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Split out of the former single `roadmap.md` on 2026-11-03 (decision 0165, plan `work-coordination.md`). Step text, ids and issue numbers are unchanged. The product-level index is `docs/plans/roadmap.md`. `Needs` lists ids in this plan only; a dependency on another plan is written in the step's Context until `work-coordination.md` step K1 makes `plan#id` parse. Live state of a step follows decision 0166 once K2 lands; until then update the marker and `Progress` line in place as before.

## Phase 3 — go-getter as an MCP server

Decision `docs/decisions/0139-go-getter-serves-adopted-pack-verbs-as-read-only-mcp-tools-over-stdio.md` fixes the design; read it first. It sits on `0119-helper-contract-v0.md` (a separate surface) and `0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md` (the allowlist that lists this server). The stdio server (`go-getter mcp serve`, #176) is done.

**Rules the design fixes (do not re-decide):** version 1 ships read tools only, enforced by a fixed read-only function list at run time; `run start|end`, `approvals add|allow|revoke` and `secret` are never exposed; stdio only; off by default; a tool prints what its CLI verb prints after the secret and personal-data check; the tools listed are those of adopted packs only.

### M2 Pack tool declarations and the never-list — [x]
Issue: #177
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/mcp-declarations.test.mjs`
Do: add an optional `mcp` section to the pack format (name, description, input schema of ids and enumerated values only, a named read-only function, class `read|write`) with schema validation; the registry lists the tools of the adopted packs only and refuses at load any declaration whose function is not on the fixed in-code list of read-only functions (so a vendored pack cannot widen it); a test guards the list against `run start|end`, `approvals`, `secret` and every writing verb, and fails if a shipped tool is not `read`.
Done-when: tests show a pack's tools listed when adopted and absent when not, an invalid declaration rejected, a declaration naming a writing verb or a path input refused, and the read-only list enforced.

### M3 The read tools — [ ]
Issue: #178
Class: implement · Effort: high · Needs: M2 · Check: `node --test compiler/test/mcp-tools.test.mjs`
Do: declare and serve, in the owning packs, plan status and next, refs, coverage, run status and next, and reading the knowledge base (list and get decisions, facts, guardrails and skills); each verb's logic is refactored where needed into a function that returns data (the CLI prints it, the server returns it), because the CLI verbs print and return exit codes and would corrupt the protocol stream; output passes stateless masking (a label per kind, no numbering), and inputs are ids resolved under `docs/` and `docs/plans/`, never paths.
Done-when: tests show each tool returning the same data its CLI verb prints, nothing but protocol messages on stdout, a secret in a result masked, a path or `../` input refused, and a project without the pack not offered the tool.

### M4 Opt-in wiring — [ ]
Issue: #179
Class: implement · Effort: high · Needs: M2 · Check: `npm run check:generated && node --test compiler/test/mcp-wiring.test.mjs`
Do: add the `mcp-server` answer (default off; pack home `orchestration` unless the build finds a better one); with it on, `apply` writes the server entry in each host's MCP configuration (locations from step 1 of `docs/plans/archive/mcp-governance.md`), owned and removable, and the allowlist of 0138 lists `go-getter` when that answer exists, with its tools classed `read` from their pack declarations. Hosts whose configuration is unconfirmed are marked so in their fact.
Done-when: tests show the entry written, removed on update or when the answer is off, not hand-editable by the owned-files rule, and the allowlist listing `go-getter` automatically.

### M5 Adopt, document and dogfood — [ ]
Issue: #180
Class: implement · Effort: medium · Needs: M3, M4 · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the answer in this repository, regenerate, describe the server in INSTALLING.md and the README, call it once from a host that reads project MCP configuration, and record in the result line what was friction.
Done-when: the checks pass and the result line states what was found.

### M6 MCP native deny rules — [ ]
Issue: #173
Class: implement · Effort: medium · Needs: none · Human: confirm the host rule forms (fact 0036) and that a Cursor project needs the allowlist; held 2026-10-12 · Check: `npm run check:generated && node --test compiler/test/mcp-native.test.mjs`
Do: where a host can deny an MCP server natively, `apply` writes a deny rule for each server of the project's MCP configuration that is off the allowlist (never for tool classes: a native rule would defeat approve-once and run grants), owned and removable like the other rules. Cursor, whose hook shows no server, is the case that needs it.
Done-when: tests show the rules written, removed on update, and not hand-editable by the owned-files rule.
