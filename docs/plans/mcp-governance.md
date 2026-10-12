# MCP governance (L.11) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-12 from an interview with the repo owner (`sergemso`) for backlog item L.11 (`docs/plans/backlog.md`, issue #93). Decision: `docs/decisions/0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md`; read it first, it fixes the design. It sits on `docs/decisions/0119-helper-contract-v0.md` (the core never speaks MCP), `docs/decisions/0126-secret-use-is-approved-once-per-user-and-bound-to-code.md`, `docs/decisions/0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops.md` and `docs/decisions/0135-gated-run-grants.md`.

## What you are building (read first)

A project can say which MCP servers its agents may use and how their tools are treated:

- **Allowlist** of servers by name; a call to any other server is denied (step 2).
- **Read/write classes** per tool, writes approved once per user and remembered, or granted by a run (step 3).
- **Argument scan** that denies a call carrying a secret (step 4), and **result masking** on hosts that can replace output (step 5).
- **Native rules** where a host can deny a server itself (step 6), and adoption here (step 7).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `gated-actions-need-human-approval`, `restricted-paths-denied`, `no-secrets-in-added-lines`, `no-runtime-dependencies`, `telemetry-records-metadata-only`, `neutral-source-has-no-host-specific-language`, `generated-host-files-not-hand-edited`. Reuse the shape store and run record (`compiler/src/secrets/approvals.mjs`, `compiler/src/runs/shapes.mjs`, `compiler/src/runs/record.mjs`), the gate (`compiler/src/gate.mjs`, `compiler/src/hook.mjs`) and the masking (`compiler/src/secrets/mask.mjs`, `compiler/src/secrets/patterns.mjs`); do not build a second approval path.

**Rules the design fixes (do not re-decide):** an unmarked tool counts as write; an empty allowlist allows no MCP once the answer exists; the secret text is never shown in a denial; a host that cannot block or replace is advisory and `coverage` says so; the core never speaks MCP.

---

### 1 How each host shows an MCP call — [ ]
Issue: #168
Class: explore · Needs: none · Check: `npm run check:tags`
Do: from the hook payloads and permission formats in facts 0003 to 0008 and 0031 and the capability rows, write a fact listing, per host, the tool-name shape an MCP call has in a pre-tool and a post-tool payload, whether the hook can deny it and replace its result, and the native deny rule if any. Mark what is unconfirmed.
Done-when: a fact lists the seven hosts with the name shape, deny and replace support, and native rule, unconfirmed shapes marked.

### 2 Server allowlist — [ ]
Issue: #169
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/mcp-allowlist.test.mjs`
Do: add the `mcp-servers` answer to `hitl` (a list of names matching `^[A-Za-z0-9_.-]+$`) and the gate entry that reads it; the hook parses a server and tool from the host's name shape (step 1) and compares after the normalisation rule that fact fixes, and denies a server off the list. A host whose hook shows no server is left to its native rule or marked advisory. Bump the pack version and keep the golden files in step.
Done-when: tests show an allowed server passing, an unlisted server denied on each host name shape, an empty list denying all MCP, and no change for a project without the answer.

### 3 Tool classes, approve-once and run grants — [ ]
Issue: #170
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/mcp-classes.test.mjs`
Do: add the `mcp-tools` answer (`server:tool` marked read or write). A write call is a shape `mcp:<server>:<tool>` decided by the shape store and the run record like an outward command shape, which needs these changes: the closed `APPROVABLE` list in `compiler/src/gate.mjs` becomes a test that also admits the `mcp:` family; `shapeAllowance` (`runs/shapes.mjs`), `run start --grant` (`commands/run.mjs`) and `approvals allow` (`commands/approvals.mjs`) use it; the `hitl` `run-grants` pattern and option list admit `mcp:<server>:<tool>`; pending first-use approvals key on the tool call (server, tool), not on command text; `checkShape` (`runs/preconditions.mjs`) gets the `mcp:` precondition (server still allowlisted, tool still marked write). First use asks where the hook can ask; where it cannot, `go-getter approvals allow mcp:<server>:<tool>` records it; `run-grants` may list it. An unmarked tool counts as write; a tool on an unlisted server is never granted. `approvals` lists and revokes them.
Done-when: tests show a read tool free, a write tool asking once then silent on a host that can ask, `approvals allow` recording it on a host that cannot, a run granting a listed write tool, an unmarked tool asking, a tool whose server left the allowlist refused despite an approval, and a revoked approval asking again.

### 4 Argument scan — [ ] ‖
Issue: #171
Class: implement · Effort: medium · Needs: 2 · Check: `node --test compiler/test/mcp-arguments.test.mjs`
Do: add a `sanitization` answer for scanning MCP call input; a call whose input matches the shared secret patterns is denied with a reason that names the kind, never the text.
Done-when: tests show a call with a token denied by kind, a clean call passing, and the denial text holding no secret.

### 5 Result masking — [ ] ‖
Issue: #172
Class: implement · Effort: medium · Needs: 2 · Check: `node --test compiler/test/mcp-results.test.mjs`
Do: add the capability `rewriteMcpOutput` (true where a host can replace MCP results, Cursor included) beside `rewriteOutput`, and install the post-tool hook when this governance is adopted even if no restricted path or personal-data masking is; make the masking cover MCP results using each host's answer shape (`respondPostTool` gains the Cursor branch); on a host that cannot, mark the guardrail advisory in `coverage`.
Done-when: tests show a secret and an email masked in an MCP result per supporting host (Cursor included), the hook installed for a project that adopted only MCP governance, an unchanged clean result, and `coverage` reporting the hosts that cannot.

### 6 Native rules — [ ]
Issue: #173
Class: implement · Effort: medium · Needs: 3 · Check: `npm run check:generated && node --test compiler/test/mcp-native.test.mjs`
Do: where a host can deny a server natively (step 1), `apply` writes a deny rule for each server off the allowlist, and nothing for tool classes (a native rule on a tool would defeat approve-once and run grants), owned and removable like the other rules.
Done-when: tests show the rules written, removed on update, and not hand-editable by the owned-files rule.

### 7 Adopt, document and dogfood — [ ]
Issue: #174
Class: implement · Effort: medium · Needs: 3, 4, 5, 6 · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the new answers in this repository (the servers it really uses), regenerate, describe MCP governance in INSTALLING.md and the README, and record in the plan's result line what was friction.
Done-when: the checks pass and the plan's result line states what was found.
