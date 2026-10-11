# Backlog — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`.

Moved here on 2026-10-11 from the backlog section of `docs/plans/v0.2-agent-core-hardening.md`, so each item has a step id and, under the tracker pack (decision 0117), an issue. Each item is an idea from the repository owner (`sergemso`) that is **not started**: a step here is done when its interview (or decision) is done and the plan or decision it produces exists, not when the feature is built. The build then becomes the steps of a new plan.

Read `docs/decisions/0118-extension-architecture-core-and-edges.md` and `docs/decisions/0119-helper-contract-v0.md` before L.9, L.11 and L.12; they fix the helper contract and the MCP relations. Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`.

---

### L.6 Cross-plan "what's next" — [ ]
Issue: #90
Class: plan · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then plan: no new command; `go-getter plan next|status` without a plan argument spans every plan in `docs/plans/` (the per-feature plans and this backlog) and names the step that waits for a human; a session-start line shows it. Evidence: `plan next` looks at one plan, and the L.x work was navigated by hand across several.
Done-when: the interview is recorded and a plan with steps exists for it.

### L.8 Autonomous run contract — [x]
Issue: #91
Class: plan · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then write the contract: proceeding on a plan while the operator is away, built from what exists (`plan next`, the verify gate, checkpoints, `watch`, the router, the 3-agent cap); what may be merged (green pull requests on this repository), what stays human (tags, releases, publishing, force-push), and when the run stops (red CI, a guardrail denial, a spend cap, a step that needs the owner), with a report at the end. A contract and its enforcement, not a flag that bypasses gates; per decision 0129 it is a profile (a named set of answers over `hitl`, `cost-routing` and `orchestration` plus the run rules it adds), not a new pack. Whether the tracker pack's `allow` writes apply to an unattended run is decided here (decision 0118). Evidence: about 20 "yes" confirmations in one session on steps whose order was already fixed.
Done-when: the interview is recorded and a decision and a plan with steps exist for it.
Result, 2026-10-11: the interview is recorded in decision 0130 and the build is planned in `docs/plans/autonomous-run.md` (six steps).

### L.9 Third-party packs and helpers — [ ]
Issue: #92
Class: plan · Needs: none · Check: `npm run check:plans`
Do: decide first. The helper contract is decision 0119 (envelope, data only, capabilities, digest-pinned and vendored, untrusted output, off the enforcement path) on the order of 0118. What remains is building the protocol when a trigger holds (a second implementation of a kind, a third party, or the trust steps) and the decision to load foreign code; a pack may not ship its own `run`.
Done-when: a decision records whether and how foreign packs and helpers load, and a plan with steps exists for the protocol.

### L.11 MCP governance — [ ]
Issue: #93
Class: plan · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then plan: which MCP servers a project allows, gating of their tool calls by the human-in-the-loop rules, and masking of their output (hosts that cannot redact other tools can redact MCP output, fact 0031). Decision 0119 keeps MCP out of the helper contract.
Done-when: the interview is recorded and a plan with steps exists for it.

### L.12 go-getter as an MCP server — [ ]
Issue: #94
Class: plan · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then plan: `plan next`, `refs` and `coverage` as tools a host can call; a surface only, with no change to the helper contract (decision 0119). Low priority.
Done-when: the interview is recorded and a plan with steps exists for it.

### L.14 Pack boundaries and neutral ids — [x]
Issue: #123
Class: plan · Needs: none · Check: `npm run check:plans`
Do: plan the work of decision 0129 items 1 to 3: split `governance` into path and secret use, sanitization, and data policy, with answer migration (old answer files keep rendering); provider-neutral gated-command ids with `gh-pr-*` as aliases; fold coverage, debugging and review into `verification-gate` and `orchestration`. Runs before L.11 and L.10 build on the old shapes.
Done-when: a plan with steps exists, one step per pack change, each with its done-when.
Result, 2026-10-11: the build is planned in `docs/plans/pack-boundaries.md` (six steps; step 1 settles the pack names and the migration of existing adoptions).

### L.15 Retrieval pack, virage first — [ ]
Issue: #124
Class: plan · Needs: L.11 · Check: `npm run check:plans`
Do: first record a fact on virage's integration surface (MCP tool names, hook behaviour, which host files `virage update` and its agent plugins write; each marked confirmed or not). Then interview the owner and plan the `retrieval` pack of decision 0129 item 4, with a detect-and-coexist slice that can ship before the pack.
Done-when: the fact exists, the interview is recorded and a plan with steps exists for it.

### L.13 Secret use without ceremony — [x]
Issue: #101
Class: plan · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then plan. An agent must be able to use a secret file (a dotenv file, say) without seeing its values, with no setup in the common case; go-getter exists to enable agents, not to wall them off. Measured friction (2026-10-11): the pre-tool hook denies a whole shell call that merely mentions a restricted path or a key-like word in its text (a dozen false denials); `secret run` is accepted only when the first word is exactly `go-getter` (so a symlink on PATH) and the rest is unquoted plain words; each command needs its own exact-text `use-commands` entry set by editing pack answers; ask rules for the tracker write verbs list command spellings by hand. Requirements to settle: the common case works with zero setup; approving a command is one prompt that is remembered, not an answer edit; matching reads what a command opens and not words in its text; go-getter is recognised wherever it is installed (per project in `.go-getter/bin`, per user on PATH or under the home directory, `npx`, `node <entry>`), project-local first, everywhere a feature recognises a go-getter call; the property kept is that the agent never sees the value (scrubbed output, no echo).
Done-when: the interview is recorded and a decision and a plan with steps exist for it.
Result, 2026-10-11: the interview is recorded in decision 0126 and the build is done (plan `docs/plans/archive/secret-use-without-ceremony.md`, issues #103 to #110): go-getter is recognised wherever it is installed, the hook reads what a command opens, a command's first use of a secret asks once and is remembered per user while its code is unchanged, and the tracker write verbs are gated by what a call runs.
