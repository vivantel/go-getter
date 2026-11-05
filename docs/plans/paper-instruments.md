# Paper instruments: measuring the deterministic edge — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Step fields as in go-getter decision 0069: `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`.

Added 2026-11-04 from the paper repo (`strebulaev-articles/articles.deterministic-edge`, `docs/plans/deterministic-edge-article-go-getter-requests.md` rows R1 to R6; evidence in `deterministic-edge-article-evidence.md` there). The paper's own decisions are on the branch `docs/article-deterministic-edge`, not on `master`, and they are numbered 0199 and 0200 there (renumbered from 0189 and 0190, then 0198 and 0199, as master took each number). Until that branch merges this plan cites them by branch, not by number. No step has an issue yet; the owner approves each `plan issue create`.

**Rules the paper fixes (the paper's publication decision, items 5 to 9, on the article branch):** each step is an *instrument* that changes what can be measured, not the edge itself. Every commit and PR carries a `Refs:` trailer naming the thesis it serves and the date, and the paper reports the step in its methods section. The baseline cutoff is not set in this file; it is written in the paper repo's plan (A3) after these steps have merged and run for a baseline window whose length is stated before any reading from the new instruments is looked at. Telemetry stays metadata-only (guardrail `telemetry-records-metadata-only`): a guardrail id, an event class and an outcome are metadata; prompt text and file content are not. No step adds a runtime dependency.

**Read first:** `docs/facts/0022-telemetry-record-and-recorder.md`, decision `0052-telemetry-retention`, `docs/facts/0040-oct-31-throughput-baseline-and-friction.md`, decisions `0009` (tiers), `0179` (meters).

## Phase 1 — Instruments for the paper

### P1 Keep the telemetry baseline — [ ] ‖
Issue: #314
Class: implement · Needs: none · Check: `node --test compiler/test/telemetry-retention.test.mjs`
Context: the recorder prunes lines older than `telemetry-retention-days` on every write (`compiler/src/telemetry/record.mjs`). The value comes from the active decision's `go-getter.telemetry-retention-days` (today `"30"` in `0052-telemetry-retention`). The main checkout's log starts 2026-10-31, so its first records are pruned from 2026-11-30. Thesis served: C1, C3, C4 (baseline records). Paper-motivated.
Do: write a new decision that supersedes 0052 with a longer retention and says why (a paper baseline plus treatment window must outlive 30 days; the log is local, gitignored and metadata-only). Proposed value 365 days; the owner may change it. Keep the recording mode unchanged. **Drafted 2026-11-05 as decision 0201 on the branch `docs/telemetry-retention-365`, with the test; it takes effect when the owner accepts it.**
Done-when: the new decision is active and 0052 is superseded; the test sets the value, writes a record dated 31 days ago and shows it survives a write; `go-getter check` passes.

### P2 Guardrail id on denials and stops — [x] ‖
Issue: #315
Class: implement · Needs: none · Check: `node --test compiler/test/telemetry-guardrail-id.test.mjs`
Context: on the main checkout 20 `pre-tool` denials and 131 `gate:stop` records carry no guardrail id (`taskClass` is empty on the denials), so a denial cannot be tied to the guardrail that caused it. Records are written by `compiler/src/telemetry/record.mjs` and validated by `compiler/src/telemetry/schema.mjs`; the stop record is built in `compiler/src/gate-stop.mjs`. Thesis served: C1, C3.
Do: add an optional `guardrail` field (the guardrail id) to denied `pre-tool` records and to `gate:stop` records, set by the code that decides the denial or stop. Extend the schema validation to accept only a known id string, and keep records without it valid. `telemetry summary` gains a count of denials and stops per guardrail.
Done-when: the test produces a denial and a stop and shows both records carry the id; a record with a content-like value in the field is refused by the validator; old records still load; the summary prints the per-guardrail counts.

### P3 Approval and stop events with a class — [ ] ‖
Issue: #316
Class: implement · Needs: P2 · Check: `node --test compiler/test/telemetry-approval-class.test.mjs`
Context: today the only dated record of the owner approving anything is `accepted-by` on decisions; 217 merged PRs carry no reviews; `go-getter approvals list` is empty and holds secret-path approvals only. `gate:stop` records have the outcomes `blocked`, `escalated` and `allowed` (107, 15 and 9 in five days). Same schema as P2. Open question for the implementer: whether the 15 `escalated` stops, once they carry a guardrail id (P2), already answer this; if so, this step reduces to adding the class. Thesis served: C3.
Do: record each point at which work waits for a person (a stop that needs a person, a human gate under decision 0155, a merge or release approval) as an event with `class` (`irreversible` or `routine`) and `outcome` (`approved`, `rejected`, `timed-out`), metadata only. Class comes from the action's shape, decided by a fixed table in code, not from the model.
Done-when: the test drives one irreversible and one routine approval and reads both back with the right class; the class table is a reviewable file; `telemetry summary` prints approvals per class and per day.

### P4 Mark derived against hand-written enforcement — [ ] ‖
Issue: #317
Class: implement · Needs: none · Check: `node --test compiler/test/enforcement-origin.test.mjs`
Context: `generated-by` marks that a pack emitted a guardrail file; it says nothing about whether the check logic comes from the guardrail text. It has been 26 since 2026-10-12 while the number of guardrails grew (45 to 55 on `master`). Enforcement entries carry `tier`, `check` and `run` (`builtin:...` or `npm run ...`); `compiler` reads them from frontmatter (decision 0066). Thesis served: C4. Schema change: needs a decision where the field is introduced.
Do: add an optional `origin` field to each `go-getter.enforcement` entry with the values `derived` (the check is produced from this guardrail's own text or parameters) and `authored` (hand-written). Teach `check:guardrails` to accept it and to default a missing value to `authored`. Do not backfill existing guardrails in this step; the paper's conversion rule decides which are labelled and when.
Done-when: the test shows a guardrail with `origin: derived` and one without both load; an unknown value is refused; `go-getter check guardrails` passes on this repo with no existing file changed.

### P5 Generated-share meter — [ ] ‖
Issue: #318
Class: implement · Needs: P4 · Check: `node --test compiler/test/measure-generated-share.test.mjs`
Context: decision 0179 makes a meter a first-class instrument and a reading a unit any worker can claim; `go-getter measure define <file>` and `measure read` exist, and `measure due` reported no meter. The meter must be defined before any reading is looked at. Thesis served: C4.
Do: define a meter file for the daily readings of (a) enforcement entries with `origin: derived` over all enforcement entries, (b) guardrails that are advisory-only (every tier 1) over all guardrails, with the denominator rule written in the meter: the live top-level `docs/guardrails/*.md` of the ref it is read on, excluding `archive/` and `INDEX.md`. Readings are made by a command, not by a person estimating.
Done-when: the test reads the meter on a fixture repo and gets exact figures; `measure series` prints them; the denominator rule appears in the meter file verbatim.

### P6 Bypass script as a keyless eval — [ ] ‖
Issue: #319
Class: implement · Effort: high · Needs: none · Check: `node compiler/bin/go-getter.mjs eval`
Context: the keyless evals (decision 0065) run with `promptfoo` and passed 14 of 14 on 2026-11-04 from the worktree entry point. They show passes, not bypasses. The paper's AT1 claim needs the edge attacked by a scripted adversary whose attempts and predicted outcomes were committed with dates before the checks change. The adversary is the author's, and the paper says so. Thesis served: C1. Open question for the implementer: whether bypass attempts can be written as scripted tool calls against the compiled hooks without a model call.
Do: add an eval suite that attempts, by script, a fixed list of bypass classes against the compiled tiers (for example a hook-skipping flag on a git hook, a command shape a host rule does not match, a direct write to a generated file), each with a predicted outcome (`blocked` or `passes`) in the suite file. The suite prints, per class, predicted against observed.
Done-when: the suite runs from one command with no API key; each class has a prediction in the file before the first run; a deliberately weakened check makes the matching class report `passes`.

## Order

P1 first (the 2026-11-30 deadline). P2, P4 and P6 are independent. P3 follows P2; P5 follows P4. The renumbering of the paper's decisions (F1 in the requests file) comes before any of these carries a `Refs:` to them. When all six have merged, the baseline window starts; the cutoff line is written in the paper repo after it closes.
