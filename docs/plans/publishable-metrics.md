# Publishable metrics: capabilities go-getter needs — plan (proposed 2026-11-11)

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written in the paper repo from a read of this repository (README, decisions 0154, 0170, 0199, 0200, fact 0040, outcome `faster-plan-start`, meters, plan `throughput.md`), the paper repo's `data/` and the scoring runs of 2026-11-11 (`articles.deterministic-edge/docs/plans/go-getter-publishable-capabilities-plan.md`). **Status: proposed, not accepted.** Step ids are `J1` to `J7` (the paper copy called them G1 to G7, which collide with `automation-first-gates.md`). No step has an issue yet; the owner approves each `plan issue create`. Each change carries a `Refs:` trailer per decision 0199 item 6 and is labelled an intervention with its date, so baseline and treatment stay split by time (item 7).

## Relation to existing plans

- J1 extends `throughput.md` T1 (`metrics day`, done): it adds durable attention events, a `range` report and the three denominators side by side. It does not rebuild T1.
- `paper-instruments.md` P1 to P6 (all done) cover telemetry retention, guardrail ids, approval events, derived-versus-hand-written enforcement, the generated-share meter and the bypass eval. J-steps build on them.
- `enforcement-hardening.md` H2 (done, decision 0208) made the pre-tool hook fail closed. J5 does not repeat it; it adds only what is still missing for a tier claim.
- `throughput.md` T10 (measure against the baseline) consumes J1 to J3 and J7.

## What is measured today, and why it does not publish

| Metric | Today | Why it does not support a claim |
|---|---|---|
| Human minutes per merged PR | 5 days (2026-10-31 to 11-04): 40.5, 20.5, 18.1, 52.0, 18.6 | One operator, five days, range 18 to 52, PR count dominated by one day |
| Baseline of "conventional effort" | about 45 man-hours for 2026-10-31 (fact 0040) | Estimate, not measurement (30 to 70); owner attention stated 20 h, measured 3.7 h from 5 surviving transcripts, so the ratio is about 2 to 12 times by denominator |
| Quality "unchanged" (0154) | no instrument | The speedup claim has no quality arm |
| Enforcement tier 3 | CI links read for 53 candidates | Branch protection never read, so "CI required" is untested |
| Fail-open hook runner | observed (F12) | Closed for the pre-tool hook by H2 (0208); the paper must re-state it as before and after |
| Bypass catalogue | 44 classes, one host, author-run | Script lives here (`evals/bypass.mjs`); raw output not in the paper repo; commit state ambiguous (62a1d74, f9c5d83) |
| Questions to first plan | about 32 over two sessions, one simulated run | Outcome `faster-plan-start` is draft; no readings |
| Operators | 1 | No replication |

## Phase 1 — Make the series readable (no behaviour change)

### J1 Attention events that outlive transcripts — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/metrics-range.test.mjs`
Context: human minutes per merged PR is read from host transcripts, and only 5 survived for 2026-10-31. `metrics day` is `compiler/src/metrics/day.mjs` (T1). Telemetry is metadata only (`telemetry-records-metadata-only`); retention is set by decision 0201.
Do: record human attention as metadata-only telemetry events (turn start, turn end, idle cap) so the series does not depend on transcripts. Add `go-getter metrics range --from D --to D` and give `day` and `range` a header that names the denominator and a provenance line (which source each figure came from). Report three denominators side by side: owner attention with the idle cap, active agent time, and PR-level. Per-PR rows. This step changes no go-getter behaviour a person sees, so it is not an intervention.
Done-when: the test feeds fixture events and PR JSON and gets exact figures for all three denominators; the report prints no prompt text; the series for every day since 2026-10-09 regenerates from committed or retained data, with each day's source named.

### J2 Quality ledger for "same quality" — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/metrics-quality.test.mjs`
Context: decision 0154 says quality is unchanged; no instrument reads it. Meters live in `docs/meters/` (decision 0179); the meter format is in `docs/meters/questions-to-first-plan.md`.
Do: per merged outcome record the first-pass gate result, gate retries, post-merge rework (a fix commit touching the same files within N days), reverts, CI flake and review findings. Add a meter in `docs/meters/` whose non-inferiority margin is written before any reading is taken. Report a per-PR table and a per-day rate.
Done-when: the test derives each column from fixture git and PR data; the meter file states the margin and N; the per-PR table and per-day rate print and can serve as the quality arm of the throughput claim.

## Phase 2 — Fix the design before the window opens

### J3 A comparison design — [!]
Class: plan · Needs: J1, J2 · Human: the owner picks the design and writes the cutoff; nothing here is measured until they do · Check: `npm run check:plans`
Context: decision 0199 item 7 requires the cutoff and rule to be written before the window opens. Options: (a) interrupted series with interventions labelled by date, the pre-period taken from the transcripts and PRs that exist; (b) matched task kinds, the same kind of PR done with a feature on and off; (c) alternating weeks for one capability.
Do: after the owner's choice, write the design in this file: cutoff date, the rule, non-interventions as controls (days without change), the attribution method, the breakers (easy tasks chosen, familiarity) and the analysis.
Done-when: the design is in this file with all five parts and a date earlier than the first reading it governs.

## Phase 3 — Close the enforcement gaps (parallel with Phase 2)

### J4 Branch protection is read so tier 3 can be claimed — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/coverage-branch-protection.test.mjs`
Context: tier 3 is claimed from CI links read for 53 candidates; branch protection was never read, so "CI required" is untested. `go-getter coverage` is the report; enforcement-hardening step H10 makes it honest elsewhere.
Do: `go-getter coverage` reads the default branch's required checks through the tracker/`gh` adapter and reports tier 3 as `ci-required`, `ci-not-required` or `unreadable`. A failed or unauthorised read is `unreadable`, never `ci-required`.
Done-when: the test covers the three outcomes with fixture API responses; `coverage` prints the tier 3 state; `unreadable` is reported when the read fails.

### J5 The bypass suite leaves a rerunnable record — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/bypass-record.test.mjs`
Context: `evals/bypass.mjs` prints predicted against observed (P6) but writes nothing a reader can re-run later; the 2026-11-08 baseline in `enforcement-hardening.md` H0 is in prose. Its rule: predictions are committed before a run and never edited after a result.
Do: `go-getter eval bypass` writes its raw result per run (commit, class ids, predicted, observed, host) to a file under version control, such as `evals/results/<date>-<commit>.json`. Add a check that a class present in a result has its prediction committed no later than the run's commit.
Done-when: the test shows two runs producing two files with the fields above; an edited prediction after a recorded result fails the check; the file holds no command text beyond the class id.

### J6 Finish the `faster-plan-start` outcome — [ ] ‖
Class: review · Needs: none · Human: a person runs and counts the trial goals; the brief's attribution method is not changed · Check: `go-getter measure read questions-to-first-plan`
Context: the outcome `faster-plan-start` is draft, with no readings. Its meter is `questions-to-first-plan`.
Do: run its registered attribution: re-run two past goals, read three new goals, five trial goals in all, median at most 8 questions, one session each. Record each reading with `go-getter measure read` and the kind of goal in the review log, as the brief requires.
Done-when: five readings are in the review log with goal kinds, and the median is reported even if it misses 8.

## Phase 4 — Replication and the bar

### J7 Publishability bar for the throughput metric — [!]
Class: plan · Needs: J2 · Human: the owner sets the numbers; a target set after seeing a reading does not count · Check: `npm run check:plans`
Context: decision 0154 sets the floor (5 to 10 times fewer human minutes per merged outcome, stretch 50 times, quality unchanged); decision 0199 item 8 says a result below the floor is reported as such.
Do: before the next window, write in this file the floor stated per denominator (from J1), the minimum n (weeks or PRs), the quality margin (from J2) and what is reported when only part is met.
Done-when: all four are written with a date before the first reading they govern.

### J8 Second operator or second repository — [!]
Class: implement · Needs: J1 · Human: needs another person or repository willing to run it · Check: `node --test compiler/test/metrics-export.test.mjs`
Context: one operator means no replication. Meters mark data class `internal`.
Do: add an opt-in, metadata-only export of the J1 series (data class `internal`) so one more operator or repository can produce the same report.
Done-when: another operator's series exists, or this file records the reason the claim stays n=1 and the paper words it that way.

## Order

J1 and J2 first (cheap, no behaviour change), then J3 (needs the owner's choice) and J7 (needs J2). J4, J5 and J6 run in parallel with them. J8 needs another person. The paper plan `article-excellent-knowledge-plan.md` E4 consumes J1 to J3; E3 consumes the J4 and J5 outputs.

## Stop rules

- A change to go-getter made to move a metric rather than to make it readable is labelled an intervention and the baseline window is not rewritten.
- A target set after seeing a reading is not counted as a target.
- Quality constant means the margin registered in J2; dropping a gate to gain speed (0158) voids the reading.
