# Interview follow-ups (decisions 0147-0151) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`.

Written 2026-10-31 after the owner reported that `go-getter update` meant a reinstall and re-answering every pack. Decisions: `docs/decisions/0147-the-interview-is-a-pure-read-only-cli-verb-and-a-read-mcp-tool.md` to `docs/decisions/0151-a-pack-question-may-be-advanced-and-then-takes-its-recommended-answer.md`. The verbs, the pack fields, `--accept-defaults`, the seed and the first tiers and profile (verification-gate, tracker, orchestration) are built; these steps are what remains.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`.

---

### 1 Audit the other packs for tiers and profiles — [ ]
Issue: #233
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/shipped-tiers-profiles.test.mjs`
Do: go through `context`, `cost-routing`, `checkpointing`, `git-workflow`, `telemetry`, `tracker` (profiles), `orchestration` (a delegation topic over roster, reviewer, escalation and handoff) and `verification-gate` (a profile for `machine-profile`, `review-bar` and `gate`) and, for each question, decide basic or advanced under the limits of decision 0151 item 5 and where one topic spans several questions add a profile. Pin the advanced set in the test beside the rule it follows.
Done-when: every pack has been looked at, the pinned set in the test is the reviewed result, and a first install of the harness packs asks measurably fewer questions (the test counts them).

### 2 Confirm detected values in one question — [ ]
Issue: #234
Class: plan · Effort: medium · Needs: none · Check: `npm run check:plans`
Do: interview the owner, then write the decision. `verification-gate` asks up to ten "keep the detected command?" questions; a single question that lists the detected values and takes "all of these" or "let me edit" may cut more than tiering. Settle how it fits `interview next` (a `confirm` kind with the detected values), what happens to a value the owner edits, and how it differs from an advanced default.
Done-when: a decision exists and a build step for it is added to this plan.

### 3 The interview as MCP read tools — [!]
Issue: #235
Class: implement · Effort: medium · Needs: none · Human: waits for the pack tool declarations and read tools, steps 2 and 3 of `docs/plans/mcp-server.md` · Check: `node --test compiler/test/mcp-interview.test.mjs`
Do: when the packs can declare tools, declare `interview_next` and `interview_validate` in the owning packs as class `read`, taking a pack id and an answers object (never a path), returning what the CLI verbs print; add both verbs to the fixed read-only list and extend the test that guards it. The server lists them only for adopted packs, so the first-install interview stays on the CLI (decision 0147 item 4).
Done-when: tests show both tools listed for an adopted pack and absent otherwise, an invalid answers object answered with errors, no interview write tool exposed, and the read-only list guard failing if one is added.

### 4 Read the adoption version from the whole pack — [ ]
Issue: #236
Class: implement · Effort: low · Needs: none · Check: `node --test compiler/test/update/update.test.mjs`
Do: `update` takes the version a pack was adopted at from its first artifact (`adopted[0]`); when a pack's artifacts carry different `generated-by` versions (a decision kept from 0.2.0, another rendered at 0.4.0) a question can be wrongly treated as new or as recorded. Write the failing test first, then decide whether the minimum or the maximum version is right.
Done-when: a test with mixed versions shows the right questions treated as new, and the note for a gap names the right ones.

### 5 Release the interview work — [ ]
Issue: #237
Class: implement · Effort: low · Needs: 1 · Human: tag and publish are the owner's · Check: `npm run check:versions`
Do: run `go-getter:changelog`, bump the version (minor: new verbs, pack fields and update flag), open the release pull request as for 0.3.6. The owner tags and publishes.
Done-when: the release pull request is merged and the tag exists.
