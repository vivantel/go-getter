# Publishable metrics: capabilities go-getter needs — plan (accepted 2026-11-11)

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written in the paper repo from a read of this repository (README, decisions 0154, 0170, 0199, 0200, fact 0040, outcome `faster-plan-start`, meters, plan `throughput.md`), the paper repo's `data/` and the scoring runs of 2026-11-11 (`articles.deterministic-edge/docs/plans/go-getter-publishable-capabilities-plan.md`). **Status: accepted by the owner on 2026-11-11.** Step ids are `J1` to `J8` (the paper copy called them G1 to G7, which collide with `automation-first-gates.md`; mapping: G1 to G3 are J1 to J3, G5 is split into J4 and J5, G6 is J6, G7 is J7, G4 is J8). J1, J2, J4 and J5 have issues; the owner approves each further `plan issue create`. Each change carries a `Refs:` trailer per decision 0199 item 6 and is labelled an intervention with its date, so baseline and treatment stay split by time (item 7).

## Relation to existing plans

- J1 extends `throughput.md` T1 (`metrics day`, done): it adds durable attention events, a `range` report and the three denominators side by side. It does not rebuild T1.
- `paper-instruments.md` P1 to P6 (all done) cover telemetry retention, guardrail ids, approval events, derived-versus-hand-written enforcement, the generated-share meter and the bypass eval. J-steps build on them.
- `enforcement-hardening.md` H2 (done, decision 0208) made the pre-tool hook fail closed. J4 and J5 do not repeat it; they add only what is still missing for a tier claim.
- `throughput.md` T10 (measure against the baseline) consumes J1 to J3 and J7.

## What is measured today, and why it does not publish

| Metric | Today | Why it does not support a claim |
|---|---|---|
| Human minutes per merged PR | 5 days (2026-10-31 to 11-04): 40.5, 20.5, 18.1, 52.0, 18.6 | One operator, five days, range 18 to 52, PR count dominated by one day |
| Baseline of "conventional effort" | about 45 man-hours for 2026-10-31 (fact 0040) | Estimate, not measurement (30 to 70); owner attention stated 20 h, measured 3.7 h from 5 surviving transcripts, so the ratio is about 2 to 12 times by denominator |
| Quality "unchanged" (0154) | no instrument | The speedup claim has no quality arm |
| Enforcement tier 3 | CI links read for 53 candidates | Branch protection never read, so "CI required" is untested |
| Fail-open hook runner | observed (F12) | Closed for the pre-tool hook by H2 (0208); the paper must re-state it as before and after |
| Bypass catalogue | 44 classes in the paper's read; 58 on master on 2026-11-11 (55 as predicted); one host, author-run | Script lives here (`evals/bypass.mjs`); raw output not in the paper repo; commit state ambiguous (62a1d74, f9c5d83) |
| Questions to first plan | about 32 over two sessions, one simulated run | Outcome `faster-plan-start` is draft; no readings |
| Operators | 1 | No replication |

## Phase 1 — Make the series readable (no behaviour change)

### J1 Attention events that outlive transcripts — [ ] ‖
Issue: #376
Class: implement · Needs: none · Check: `node --test compiler/test/metrics-range.test.mjs`
Context: human minutes per merged PR is read from host transcripts, and only 5 survived for 2026-10-31. `metrics day` is `compiler/src/metrics/day.mjs` (T1). Telemetry is metadata only (`telemetry-records-metadata-only`); retention is 365 days (decision 0202, which supersedes 0201 and 0052).
Do: record human attention as metadata-only telemetry events (turn start and turn end only) so the series does not depend on transcripts. The idle cap is applied when a report runs, not when an event is recorded: 10 minutes, as in `metrics day` (T1), registered before any reading, with other caps allowed only as a labelled sensitivity check. A failed event write is counted as its own telemetry outcome and never denies a prompt, so this step stays a non-intervention. `metrics range` also writes a committed per-day file (date, the three denominators, merged PR count, source of each figure; no turn timestamps) so the figures can be verified without the local log. Transcripts and events run side by side for an overlap period of one to two weeks after this step lands, and the report states how closely they agree, so the change of instrument at the cutoff is not read as a treatment effect. Add `go-getter metrics range --from D --to D` and give `day` and `range` a header that names the denominator and a provenance line (which source each figure came from). Report three denominators side by side: owner attention with the idle cap, active agent time, and PR-level. Per-PR rows. This step changes no go-getter behaviour a person sees, so it is not an intervention.
Done-when: the test feeds fixture events and PR JSON and gets exact figures for all three denominators; the report prints no prompt text; a test shows a failing event write leaves the prompt allowed and counted; the per-day file is written and regenerates from the log; every day since 2026-10-09 either regenerates with its source named or is listed as having no source, with the reason; the overlap report prints the agreement between transcripts and events.

### J2 Quality ledger for "same quality" — [ ] ‖
Issue: #377
Class: implement · Needs: none · Check: `node --test compiler/test/metrics-quality.test.mjs`
Context: decision 0154 says quality is unchanged; no instrument reads it. Meters live in `docs/meters/` (decision 0179); the meter format is in `docs/meters/questions-to-first-plan.md`.
Do: per merged outcome record the first-pass gate result, gate retries, post-merge rework (a fix commit touching the same files within N days), reverts, CI flake and review findings. Add a meter in `docs/meters/` whose non-inferiority margin is the one registered in J7, written before any reading is taken. The rework window N is 7 days (owner, 2026-11-11), written in the meter beside the margin. Report a per-PR table and a per-day rate.
Done-when: the test derives each column from fixture git and PR data; the meter file states the margin and N; the per-PR table and per-day rate print and can serve as the quality arm of the throughput claim.

## Phase 2 — Fix the design before the window opens

### J3 A comparison design — [ ]
Class: plan · Needs: J1, J2 · Human: none for the rule; the cutoff date is written here when J1 and J2 have both merged · Check: `npm run check:plans`
Context: decision 0199 item 7 requires the cutoff and rule to be written before the window opens. Chosen by the owner 2026-11-11: **(a) an interrupted series** with interventions labelled by date and the pre-period taken from the transcripts and PRs that exist. Pre-period (owner, 2026-11-11): interventions merged before the cutoff (the hardening batch H1 to H8 and the earlier T-steps) are listed by merge date as pre-period history, not as a clean baseline; the series tests the first intervention after the cutoff, named in this file. Not chosen: (b) matched task kinds with a feature on and off; (c) alternating weeks for one capability.
Cutoff rule (owner, 2026-11-11): the cutoff is the merge date of the later of J1 and J2, so the instruments exist and change no behaviour; everything before it is baseline, read from retained data, and the date is recorded on this line when it is known: **Cutoff date: pending.**
Do: write the rest of the design in this file: the cutoff date once known, the first post-cutoff intervention the series tests, the rule for what counts as an intervention (a go-getter change that can move a metric, labelled with its merge date), non-interventions as controls (days without change), the attribution method, the breakers (easy tasks chosen, familiarity) and the analysis.
Done-when: the design is in this file with all six parts and a date earlier than the first reading it governs.

## Phase 3 — Close the enforcement gaps (parallel with Phase 2)

### J4 Branch protection is read so tier 3 can be claimed — [ ] ‖
Issue: #378
Class: implement · Needs: none · Check: `node --test compiler/test/coverage-branch-protection.test.mjs`
Context: tier 3 is claimed from CI links read for 53 candidates; branch protection was never read, so "CI required" is untested. `go-getter coverage` is the report; enforcement-hardening step H9 (done) made its table honest for host capability.
Do: `go-getter coverage` reads the default branch's required checks through the tracker/`gh` adapter and reports tier 3 as `ci-required`, `ci-not-required` or `unreadable`. It reads both classic branch protection (which needs admin scope) and the rules that apply to the branch (rulesets, readable without admin). A source that cannot be read is `unreadable`, never `ci-required`.
Done-when: the test covers the three outcomes with fixture API responses, one set for branch protection and one for rulesets; `coverage` prints the tier 3 state; `unreadable` is reported when the read fails.

### J5 The bypass suite leaves a rerunnable record — [ ] ‖
Issue: #379
Class: implement · Needs: none · Check: `node --test compiler/test/bypass-record.test.mjs`
Context: `evals/bypass.mjs` prints predicted against observed (P6) but writes nothing a reader can re-run later; the 2026-11-08 baseline in `enforcement-hardening.md` H0 is in prose. Its rule: predictions are committed before a run and never edited after a result.
Do: `go-getter eval bypass` writes its raw result per run (commit, class ids, predicted, observed, host) to a file under version control, such as `evals/results/<date>-<commit>.json`. Add a check that a class present in a result has its prediction committed no later than the run's commit.
Done-when: the test shows two runs producing two files with the fields above; an edited prediction after a recorded result fails the check; the file holds no command text beyond the class id.

### J6 Finish the `faster-plan-start` outcome — [ ] ‖
Class: review · Needs: none · Human: a person runs and counts the trial goals; the brief's attribution method is not changed · Check: `go-getter measure series questions-to-first-plan`
Context: the outcome `faster-plan-start` is draft, with no readings. Its meter is `questions-to-first-plan`.
Do: run its registered attribution: re-run two past goals, read three new goals, five trial goals in all, median at most 8 questions, one session each. Record each reading with `go-getter measure read` and the kind of goal in the review log, as the brief requires.
Done-when: five readings are in the review log with goal kinds, and the median is reported even if it misses 8.

## Phase 4 — Replication and the bar

### J7 Publishability bar for the throughput metric — [x]
Class: plan · Needs: none · Human: set by the owner 2026-11-11, before any reading under J1 or J2 · Check: `npm run check:plans`
Context: decision 0154 sets the floor (5 to 10 times fewer human minutes per merged outcome, stretch 50 times, quality unchanged); decision 0199 item 8 says a result below the floor is reported as such.
The bar (owner, 2026-11-11):
- **Floor per denominator:** the claim is stated on owner attention with the 10-minute idle cap (J1), where decision 0154 defines the metric as human minutes. Active agent time and the PR-level figure are reported beside it as context and never as the headline.
- **Minimum n:** at least 4 weeks and at least 30 merged PRs in the window, both.
- **Quality margin (counts, owner 2026-11-11):** rework (a fix commit touching the same files within 7 days) may exceed the baseline rate scaled to the window's PR count by at most 2 PRs, and the window may hold at most 1 revert. The counts are always reported with a confidence interval (J2). This replaces an earlier 5 percentage point rule that one PR could cross at n=30.
- **When only part is met:** report what was measured with the unmet condition beside it (for example "3.1 weeks, below the minimum") and make no claim against the floor. A quality result outside the margin voids the speedup claim (stop rule, 0158). A result below the floor is reported as such.
Done-when: the four parts above are written with a date before the first reading they govern.

### J8 Second operator or second repository — [ ]
Class: implement · Needs: J1 · Human: someone other than the owner must run the export; build first, recruit once it exists (owner, 2026-11-11) · Check: `node --test compiler/test/metrics-export.test.mjs`
Context: one operator means no replication. Meters mark data class `internal`.
Do: add an opt-in, metadata-only export of the J1 series (data class `internal`) so one more operator or repository can produce the same report.
Done-when: another operator's series exists, or by the paper's submission this file records the reason the claim stays n=1 and the paper words it that way.

## Order

J1 and J2 first (cheap, no behaviour change), then J3 (written when both have merged, because that date is the cutoff). J7 is done: its numbers are consumed by J1, J2 and J3. J4, J5 and J6 run in parallel with them. J8 needs another person. The paper plan `article-excellent-knowledge-plan.md` E4 consumes J1 to J3; E3 consumes the J4 and J5 outputs.

## Stop rules

- A change to go-getter made to move a metric rather than to make it readable is labelled an intervention and the baseline window is not rewritten.
- A target set after seeing a reading is not counted as a target.
- Quality constant means the margin registered in J7 (copied into the J2 meter); dropping a gate to gain speed (0158) voids the reading.
