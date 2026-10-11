# Pack boundaries and neutral ids (L.14) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-11 for backlog item L.14 (`docs/plans/backlog.md`, issue #123) from decision `docs/decisions/0129-pack-boundaries-neutral-ids-and-a-retrieval-pack.md` (items 1 to 3); read it first, it fixes the design. Work order: `docs/decisions/0131-pack-boundaries-then-the-run-approvals-then-mcp.md` (this plan runs first).

## What you are building (read first)

- **`governance` becomes three packs**, one concern each (step 3). By the questions it asks today:
  - `restricted-data`: `restricted-paths`, `restricted-modes`, `enforcement`, `use-commands`, `sink-sources`, `restricted-hosts`.
  - `sanitization`: `secret-scan`, `scan-allow-paths`, `pii-masking`, `pii-extra`.
  - `data-policy`: `internal-data`, `provider`, `confidential-zdr`, `prompt-logging`.
  Names and grouping are settled by decision 0132 (step 1). Runtime code reads adopted data by key (`adoptedData`, `compiler/src/governance.mjs`), not by pack id, so the split is about pack files, generated decisions and guardrails, answer migration and docs, not the hook runtime.
- **Neutral gated-command ids** (step 4): the catalog in `compiler/src/gate.mjs` names the action, and a provider table (GitHub first) supplies the command patterns and native ask globs. `gh-pr-*` ids and the `gh-pr` alias keep working.
- **One owner per concern** (step 5): coverage in `verification-gate`; review owned by `verification-gate` (the bar) with `orchestration` keeping only the reviewer role.
- **Families are already declared** (`harness` and `sdlc` in each `pack.json`); step 6 makes the docs say it and checks harness packs for software-only wording.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `owned-files-never-clobbered`, `pack-questions-have-a-recommended-default`, `guardrails-declare-enforcement`, `generated-host-files-not-hand-edited`, `practice-ships-only-after-self-adoption`, `no-runtime-dependencies`. Golden files: `UPDATE_GOLDEN=1 node --test compiler/test/<pack>-pack.test.mjs`; run `npm run build` before `check:generated`.

**Rules the design fixes (do not re-decide):** an existing answer file and an existing adoption keep working after the split and after `update`; no answer is lost or asked again; an id that exists today stays accepted as an alias; no new runtime dependency.

## Inventory (step 1, 2026-10-11)

Decision `docs/decisions/0132-governance-splits-into-three-packs-and-existing-adoptions-are-relabelled.md` fixes the names, the takeover and the relabel. Where `governance` is named:

- **Pack**: `src/packs/governance/pack.json` (13 questions, outputs only inside one group each); the vendored copy under `plugins/go-getter/skills/go-getter-init/cli/` is rebuilt by `npm run build`.
- **Compiler**: `compiler/src/packs.mjs` (`validatePack`, directory name must equal id; add `replaces`) and `compiler/schemas/pack.schema.json`; `compiler/src/update.mjs` (`reRender` loops `adoptedPacks`; relabel goes before it); `compiler/src/reconfigure.mjs` (`adoptedArtifacts` matches `generated-by` by `<id>@`); `compiler/src/manifest.mjs` (`adoptedPacks` reads `generated-by`); `compiler/src/coverage.mjs` (lists packs by `components`). `compiler/src/governance.mjs` and every `adoptedData` caller read by key and need no change.
- **Tests**: `compiler/test/governance-pack.test.mjs` (pack, golden files, coverage row `governance@...` at lines 151-154), `cost-routing-pack.test.mjs` (loads the pack), `self-adoption.test.mjs` (fixtures only), `pack-answers-roundtrip.test.mjs`, `pack-renamed.test.mjs` (the rename mechanism to model on).
- **This repository**: `.go-getter/manifest.json` (`governance: 0.5.0`) and the artifacts with `generated-by: governance@...`: guardrails `restricted-paths-denied`, `restricted-data-hosts-rule`, `pii-masked-in-tool-output`, `no-secrets-in-added-lines`, `prompt-logging-disabled`; decisions 0045 to 0050, 0077, 0108, 0109, 0113 to 0116.
- **Docs**: `README.md` (lines 23, 44, 57), `INSTALLING.md` (line 105), `src/skills/go-getter-init/examples.md` (line 17), `docs/skills/tags.md`.

Versions: the new packs start at 0.6.0 and keep each question's `since`.

---

### 1 Inventory and migration design — [x]
Issue: #135
Class: plan · Effort: medium · Needs: none · Check: `npm run check:plans && npm run check:tags`
Do: list every place that names the `governance` pack or one of its questions (pack files, `update.mjs`, `reconfigure.mjs`, `render.mjs`, generated decisions and guardrails with `generated-by: governance@...`, this repository's own adoption, tests, docs) with file and line; settle the three pack names and the question each takes; decide how a project that adopted `governance` moves (a pack declares the pack and questions it took over; `update` reads the old adoption and writes the new ones; what happens to the old rendered decisions and guardrails). Record the outcome as a decision that refines 0129 item 2.
Done-when: the decision exists, the inventory is in the plan, and steps 2 and 3 name every file they change.
Result, 2026-10-11: decision 0132 and the inventory above; the split is mechanical (no output reads a question outside its group).

### 2 Let a pack take over a retired pack's answers — [x]
Issue: #136
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/pack-takeover.test.mjs`
Do: add `replaces` to `compiler/schemas/pack.schema.json` and `compiler/src/packs.mjs`, and the relabel pre-step of decision 0132 to `compiler/src/update.mjs` (with `reconfigure.mjs` and `render.mjs` unchanged unless the tests show otherwise), so a project adopted at `governance@0.5.0` is read as answering the new packs, the old generated artifacts are retired as `update` already retires a decision whose question was removed (the gap recorded in the v0.2 plan follow-ups), and nothing is clobbered (`owned-files-never-clobbered`).
Done-when: tests (with a synthetic retired pack, since the real split is step 3) show a project moving to the packs that took it over with the same answers, no question re-asked, an owner-edited decision body kept, a question no pack took over left and reported, a second update changing nothing, and the schema refusing a bad `replaces`. The test over every released governance version moves to step 3.

### 3 Split `governance` into three packs — [x]
Issue: #137
Class: implement · Effort: high · Needs: 2 · Check: `npm test && npm run check:packs && npm run check:generated`
Do: create the three packs from `src/packs/governance/pack.json`, keeping question ids, defaults, recommended options and `since` values, with golden files, each declaring `replaces` for `governance`; delete `src/packs/governance/` (decision 0132). Adopt the new packs in this repository (regenerate `docs/` decisions and guardrails, `AGENTS.md`, host files), update `INSTALLING.md`, the README pack table and the interview skill, and note it in the changelog.
Done-when: tests and checks pass, a project adopted at each released governance version (rebuilt from the pack at each tag) updates to the new packs with the same answers and nothing asked again, this repository's adoption renders the same guardrails and settings as before the split, and `go-getter update` on a fixture project adopted at 0.5.0 gives the same enforcement.
Result, 2026-10-11: three packs at 0.6.0, `governance` deleted, this repository re-adopted by `go-getter update` (only `generated-by` and the manifest changed; no host file or AGENTS.md diff). `compiler/test/governance-split.test.mjs` rebuilds an adoption at each released governance version (0.2.0, 0.5.0) and updates it. Known gap, not caused by the split: the `provider` answer of `internal-data: single-provider` is recorded by no artifact, so `update` cannot re-render that pack for such a project (it says so and leaves it).

### 4 Neutral gated-command ids with a provider table ‖ — [x]
Issue: #138
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/gate.test.mjs compiler/test/hitl-pack.test.mjs`
Do: in `compiler/src/gate.mjs` rename the entries to the action (`pr-create`, `pr-merge`, `pr-close`, `release-create`, `comment-post`; `git-push`, `git-tag-create`, `package-publish` already are) and add a provider table, GitHub first, giving each action its command pattern, examples and native ask globs. `gh-pr-*`, `gh-pr`, `gh-release-create` and `gh-comment` stay accepted as aliases in `free-commands` and `extra-patterns`. `hitl` gains a minor version with neutral wording; the guardrail `gated-actions-need-human-approval` and decision 0127 keep their meaning, and this repository's answer keeps working unchanged.
Done-when: tests show each neutral id matching the GitHub commands, every alias accepted, an unknown provider id rejected with a clear message, and the native ask rules unchanged for this repository.
Result, 2026-10-11: ids renamed, `PROVIDERS`/`catalogFor` in `compiler/src/gate.mjs`, `provider=` arg on `gate-command`, hitl 0.4.0; this repository's host files did not change. `extra-patterns` holds command text, not ids, so nothing there needed an alias.

### 5 One owner for coverage and review ‖ — [ ]
Issue: #139
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/verification-gate-pack.test.mjs compiler/test/orchestration-pack.test.mjs`
Do: add to `verification-gate` the questions for a coverage command and a coverage bar (a threshold or "no regression"), each with a recommended default and wired into the gate and the local and CI duty split (decision 0071). State in both packs' prompts and in `INSTALLING.md` that `verification-gate` owns the review bar and `orchestration` owns only the reviewer role (read-only, `reviewer-read-only`); remove any question that duplicates the other. Debugging is not built here: it stays with the v0.4 testing item and its interview.
Done-when: golden tests pass, a project without the new answers renders as before, and the two packs share no question about the same thing.

### 6 Say what is harness and what is practice — [ ]
Issue: #140
Class: implement · Effort: low · Needs: 3, 4, 5 · Check: `npm run check:neutral && npm run check:self-adoption`
Do: state in the README and `INSTALLING.md` which packs are harness (domain-neutral) and which are practice packs for software work, from the `family` already in each `pack.json`; scan harness pack prompts, options and generated text for software-only or provider-only wording and fix what is found; record the result in the plan.
Done-when: the docs name the two families, the scan finds no software-only or provider-only wording in a harness pack, and the checks pass.
