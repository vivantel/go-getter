# Autonomous run contract (L.8) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-11 from an interview with the repo owner (`sergemso`) for backlog item L.8 (`docs/plans/backlog.md`). Decision: `docs/decisions/0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops.md`; read it first, it fixes the design. It extends `docs/decisions/0126-secret-use-is-approved-once-per-user-and-bound-to-code.md` (approvals) and `docs/decisions/0127-gated-free-commands.md` (free commands), and is a profile over packs per `docs/decisions/0129-pack-boundaries-neutral-ids-and-a-retrieval-pack.md`.

## What you are building (read first)

An operator starts a run on a plan range once; the agent proceeds through it without asking for each merge, within hard limits.

- **A run record** per user, outside git, per project, that an agent cannot write (step 1).
- **Approve-once** for outward command shapes, with preconditions checked at every use (step 2).
- **Limits**: the always-human set, tracker writes scoped to the run's steps, and stops for spend, human-needed steps, red CI and repeated denials (steps 3, 4).
- **A report** posted on the plan's issue (step 5), and this repository adopting the profile (step 6).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `gated-actions-need-human-approval`, `checkpoint-before-gated-action`, `owned-files-never-clobbered`, `no-runtime-dependencies`, `telemetry-records-metadata-only`, `human-escalation-rule`, `max-concurrent-agents-rule`. Reuse the approvals store and the hook's invocation reading (`compiler/src/secrets/approvals.mjs`, `compiler/src/invocation.mjs`, `compiler/src/gate.mjs`); do not build a second store.

**Rules the design fixes (do not re-decide):** the run record is the approval on every host; a first-use prompt exists only where the hook can ask; preconditions are checked per use; force-push, history rewrite, shared-branch deletion, repository settings, tags, releases and publishing are never granted; `comment` and `close` on the run's steps are free, `create` asks; two fix attempts per red step; a denial is recorded and never worked around.

---

### 1 Run record and `go-getter run` — [x]
Issue: #126
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/run-record.test.mjs`
Do: add a per-user run store beside the approvals store (same location rules, 0700 directory, 0600 file, atomic replace, damaged file reads as empty) and `go-getter run start <plan> [--through N] | status | end`. A record holds the plan, step range, start time, timeout, spend cap, and the granted shapes; `start` refuses when a run is active for the project. The hook refuses a call that runs `run start|end` or opens the store (same rule as `approvals add`), so only a human starts a run.
Done-when: tests show start, status and end, expiry at the timeout, refusal of a second run, and the hook denying an agent's attempt to start a run or write the store.

### 2 Approve-once for outward shapes with preconditions — [ ]
Issue: #127
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/outward-approval.test.mjs`
Do: let a catalog id in `compiler/src/gate.mjs` be approved by a remembered per-user approval (first use asks on a host whose hook can ask) or by the active run record (any host). Add per-shape preconditions run at each use: `pr-merge` needs green required checks, the default branch as base and a pull request tied to a step in the run's range; a failure asks again or ends the run. `hitl` gains a question for the shapes a run may grant, with a recommended default.
Done-when: tests show a merge allowed with green checks in range, refused for a red pull request, a pull request outside the range and a non-default base, silent after the first approval, and a host that cannot ask using the run record only.

### 3 The always-human set and tracker scope — [ ]
Issue: #128
Class: implement · Effort: medium · Needs: 1 · Check: `node --test compiler/test/run-limits.test.mjs`
Do: in a run, force-push, history rewrite, shared-branch deletion, repository settings or branch protection changes, tags, releases and publishing stay gated regardless of the record or a remembered approval. `plan issue comment|close` on a step in the range are free; `create` and any other step ask (0124).
Done-when: tests show each always-human command still denied or asked inside a run and the tracker verbs scoped as described.

### 4 Stop rules and the run procedure — [ ]
Issue: #129
Class: implement · Effort: high · Needs: 2, 3 · Check: `node --test compiler/test/run-stops.test.mjs`
Do: add `go-getter run next`, which gives the next step of the range or the reason to stop: spend cap reached, a step needing a human, two red attempts on one step, or a repeated denial on one step. Record denials and attempts in the run record (metadata only). Add the run procedure as a skill under `src/skills/` that tells the agent to follow `run next`, fix red CI up to the bound, and take a permitted alternative after a denial.
Done-when: tests show each stop, no silent skip of a human-needed step, and a recorded denial counted toward the repeat rule.

### 5 End-of-run report — [ ]
Issue: #130
Class: implement · Effort: medium · Needs: 4 · Check: `node --test compiler/test/run-report.test.mjs`
Do: `go-getter run end` builds the report: steps done, pull requests merged and issues closed with links, stops, denials and skipped steps with reasons, spend and approvals used (from telemetry metadata and the approvals store). It posts the report as a comment on the plan's issue after the secret and personal-data check, and prints it when there is no issue.
Done-when: tests show the report content for a finished and a stopped run, the check blocking a secret in the text, and no prompt or file content in it.

### 6 Adopt, document and dogfood — [ ]
Issue: #131
Class: implement · Effort: medium · Needs: 5 · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the new `hitl` answers in this repository, regenerate, describe the run in INSTALLING.md and the README, and run one real run over a small plan range on this repository, recording what was friction.
Done-when: the checks pass and the plan's result line states what the dogfood run found.
