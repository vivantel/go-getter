# Enforcement hardening: red tests first, then fixes — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-11-08 from a read-only production-readiness review of the enforcement core, the host adapters and the docs (findings are quoted per step; evidence is the file and line named in each). The review scored the tier-2 hook layer 4/10 as a hard control, usability 4/10, host portability 5/10 and documentation 5/10. This plan fixes the findings in a measurable way: **every fix is preceded by a test that is seen failing for the stated reason.** No step has an issue yet; the owner approves each `plan issue create`.

**Read first:** `docs/guardrails/gated-actions-need-human-approval.md`, `restricted-paths-denied`, `owned-files-never-clobbered`, `raw-commands-redirect-to-verbs`; decisions `0019` (fail-open runner), `0025` (shared tier-2 runtime), `0094`, `0126`; `evals/bypass.mjs` (the bypass suite and its rule that predictions are written before a run).

## The method (applies to every step)

1. **Red.** Add the test, or the bypass class, first. Run it and record the failing output in the step's `Red:` line (command, failing assertion, commit). A test that cannot fail for the stated reason is rewritten until it does. A new bypass class carries its predicted outcome (`blocked`) in `evals/bypass.mjs` in the same commit, before it is run; the prediction is never edited after a result is seen (the file's own rule).
2. **Green.** Make the change. The same command must pass; record it in `Green:`.
3. **Guard against regression.** `npm test`, `npm run check:generated`, `npm run check:guardrails` and `npm run eval` pass. For a gate change, `compiler/test/gate*.test.mjs` match and no-match examples stay green, and false blocks do not rise: the step reports false blocks per 100 gate events from `go-getter telemetry summary` before and after.
4. **Commit order.** The red commit comes before the fix commit on the branch (squash merge keeps both in the PR body). The PR description lists the red and green commands.

## Measures (read by command, no estimates)

| Id | Measure | Command | Today | Target |
|---|---|---|---|---|
| M1 | Bypass classes that pass tier 2/3 unattended | `go-getter eval bypass` (count of `passes`) | read first in H0 | 0 of the classes added here |
| M2 | Hook calls that fail open on an internal error | `node --test compiler/test/hook-failure-mode.test.mjs` (count of fail-open cases) | read first in H0 | 0 for pre-tool |
| M3 | Docs/capability disagreements | `go-getter check docs-consistency` (added in H9) | read in H9 red | 0 |
| M4 | Unconfirmed claims in the coverage table | `go-getter coverage --json` cells with `confirmed: false` shown as plain `hook` | read in H8 red | 0 |
| M5 | False blocks | `go-getter telemetry summary` denials later overridden, per 100 gate events | read in H0 | no rise |

**Paper note (owner, 2026-11-08: one registered batch).** H1 to H8 are registered once, as a single intervention batch with thesis C1/C2, metrics M1, M2 and M5, direction down, before the first of them merges; the bypass suite reports before and after for the whole batch. Phases 4 to 6 are separate entries when they start.

**Paper note (rule).** The deterministic-edge paper registers every go-getter fix after 2026-11-06 as an intervention (thesis, metric, direction, falsifier) before it merges. Each step below names the thesis (C1 unless stated), the metric above, the direction (down) and the falsifier (the red test still red after the fix, or M5 rising). The owner or the paper repo's plan records the entry; these steps do not edit the paper repo.

## Phase 0 — Baseline

### H0 Record the red baseline — [x]
Class: explore · Needs: none · Check: `node compiler/bin/go-getter.mjs eval bypass`
Context: the bypass suite runs scripted attempts against the compiled hooks and prints predicted against observed. The review found these spellings get past the tier-2 gate; none is in the suite yet.
Do: run `eval bypass`, `telemetry summary` and the test suite; write the figures for M1, M2 and M5 into this table (a `Result:` line). Change no code.
Done-when: M1, M2, M5 have a dated baseline figure and the command that gave it.
Result 2026-11-08 (master at a354dbf): **M1** `go-getter eval bypass`: 46 classes, 19 pass unattended (20 predicted), 27 blocked; 45 as predicted. The one differing class is `T2-script-opens-file`: predicted `passes`, observed `blocked` (the hook sees the restricted file name in the command text). The prediction is not edited (the suite's rule); the paper reports it as a prediction that differed. None of the classes this plan adds exists yet, so M1's target of 0 unattended passes applies to the new classes H1, H5, H6 and H7 add. **M2** has no test yet; the baseline is the H2 red test (five fail-open cases, all expected to fail) and the telemetry count of `fail` outcomes: 13 of 9,880 records, 11 of them `user-prompt:exception`. **M5** `go-getter telemetry summary`: 26 denied of 3,545 pre-tool records (0.73 per 100); override data is not recorded, so a rise is read as a rise in this rate.

## Phase 1 — Blockers and fail-closed (do first, in this order)

### H1 The hook reads policy from the project root, not the session directory — [x]
Issue: #352
Class: implement · Effort: high · Needs: H0 · Check: `node --test compiler/test/hook-project-root.test.mjs`
Finding: `compiler/src/commands/hook.mjs:50` sets `dir = payload.cwd ?? project`, ignoring `--project`; after `cd compiler`, `collectEnforcement` finds no `docs/guardrails` and every check sees zero guardrails. Tests pipe `'{}'`, so `payload.cwd` is never exercised.
Red: the test adopts the recommended packs in a scratch project, sends a pre-tool payload with `cwd` set to a subdirectory (and to an unrelated directory) for (a) a read of the restricted env file, (b) `git push --force`, (c) a Write to a generated host file, and asserts each is denied or asked exactly as with `cwd` at the root. It must fail on the current code. Add three bypass classes (`T2-cwd-subdir-*`) predicted `blocked`.
Do: resolve policy from `--project` (walk up from `cwd` to the nearest `.go-getter` only when `--project` is absent); keep `cwd` only for resolving relative path tokens.
Done-when: the test and the three bypass classes pass; M1 falls by 3.
Red 2026-11-08: `node --test compiler/test/hook-project-root.test.mjs`: 3 of 3 fail (`cwd subdir:` empty output, exit 0) while the same calls at the root exit 2. Classes `T2-cwd-subdir-read-restricted`, `-force-push`, `-write-generated` added predicted `blocked`.
Green 2026-11-08: the same command passes 3 of 3. `eval bypass`: 49 classes, 47 as predicted; read-restricted and force-push blocked. **Differs:** `T2-cwd-subdir-write-generated` passes unattended, at any `cwd`: the generated-file guardrail is tier 3 only, so no hook stops a write to a generated host file. The prediction stays; this is a finding (step H12). Relative path tokens still resolve against the project root, not the shell directory; that is H7. `npm test` 1350 pass; `check:generated` and `check:guardrails` ok.

### H2 A broken or tampered guardrail file cannot switch enforcement off — [x] ‖
Class: implement · Needs: H0 · Human: accepted by the owner 2026-11-08 (decision 0208, accepted); it supersedes the fail-open part of 0019/0025 · Check: `node --test compiler/test/hook-failure-mode.test.mjs`
Finding: an unparseable guardrail makes `collectEnforcement` throw, uncaught at `commands/hook.mjs:96`, exit 1, which hosts treat as non-blocking; a malformed payload returns 0 (`:44-49`); `gatedCommand` swallows every error (`hook.mjs:260`).
Red: table-driven test, one case per failure (malformed payload, unreadable guardrails dir, unparseable guardrail, thrown check, bad regex), asserting a pre-tool exit code that blocks (host convention per adapter) and a one-line reason on stderr with no command text. Every case fails today.
Do: draft the superseding decision (pre-tool fails closed on internal error for tools that can change state; read-only tools and `stop`/`session-*` stay fail-open; the runner-missing case is H3). Implement it. Telemetry records `outcome: fail` with the trigger.
**UX rule (owner, 2026-11-08): a user must never have to switch go-getter off to proceed.** Every fail-closed denial prints (a) which check failed, (b) the one command that repairs it (`go-getter host check --fix`), and (c) for a person only, `go-getter approval create --once <shape>` to let this single call through. A repair is idempotent and local. A denial caused by go-getter's own fault (not by a rule) is retried once before it blocks. Telemetry counts such denials separately (`outcome: fail`), so M2 and the false-block rate show whether fail-closed hurts.
Done-when: all cases block with the three-part message; read-only tool calls still pass; after the repair command the same call passes; M2 is 0 for pre-tool.
Red 2026-11-08: `node --test compiler/test/hook-failure-mode.test.mjs` against the unfixed source: 0 pass, 7 fail (five fail-open cases, the read-only guard and the telemetry record). The "check that throws" case is a guardrail whose `run` is not text; no built-in check throws on its own.
Green 2026-11-08: 7 of 7 pass; `npm test` 1354 pass; `eval bypass` unchanged (45 of 46). M2 = 0 fail-open cases for pre-tool. The decision is `0208-pre-tool-fails-closed-on-internal-error` (accepted by the owner 2026-11-08). The old test that locked an invalid gate regex as "gates nothing" now asserts the opposite. **Deviation:** the printed repair is `go-getter doctor` and the person's route is `go-getter approvals allow <shape>`: the verbs `host check --fix` and `approval create --once` do not exist yet (V1/V2); doctor names the failing file but does not repair it. Telemetry counts `outcome: fail` with trigger `internal-error` or `unreadable-payload`.

### H3 A missing runner or Node is visible, and `doctor` says so — [x] ‖
Class: implement · Needs: H0 · Check: `node --test compiler/test/doctor-enforcement.test.mjs`
Finding: the hook command exits 0 with "runner not found; hook skipped" when the runner is absent, and `.go-getter/cli` is gitignored so a fresh clone has none (`apply.mjs:246`, `INSTALLING.md:201`); `doctor` checks only allow-rules and a Claude plugin version (`commands/doctor.mjs:18-23`).
Red: tests assert `doctor` exits non-zero and names the fix when (a) Node is below 22, (b) the runner or `.go-getter/cli` is missing, (c) a host's hook entries are absent from its settings, (d) `apply --check` shows drift, (e) the plugin version differs (every host that has one, not only Claude).
Do: add these checks to `doctor`; make the runner-missing hook message say "enforcement is OFF" and record a telemetry `fail`; add `doctor` to the first-run instructions.
Done-when: all five cases fail before and pass after; a fresh clone prints a non-zero `doctor` with the one command that fixes it.
Red 2026-11-08 (commit on `fix/doctor-enforcement-checks`): `node --test compiler/test/doctor-enforcement.test.mjs`: the five cases (a) to (e) fail, each on exit status 0 where 1 is expected.
Green 2026-11-08: 7 of 7 pass; `npm test` 1354 pass; `check:generated`, `check:guardrails` ok; `eval bypass` unchanged (45 of 46). Checks live in `compiler/src/doctor-checks.mjs`; each prints `doctor: <what>` and `fix: <command>` on stderr. A project with no manifest is checked only for Node and the plugin version. The plugin-version case exits 1 now (the old test expected 0). The registry of installed plugins exists only for Claude Code; the OpenCode and Kilo plugin files are covered by the drift case. The runner-missing hook message now reads "enforcement is OFF, run go-getter apply"; **not done:** the telemetry `fail` record for that case (the hook shell snippet cannot write telemetry without the runner) and the first-run instructions mention of `doctor`.

### H4 The policy files and the approvals store are not agent-writable — [x]
Class: implement · Needs: H1 · Human: accepted by the owner 2026-11-08 (the guardrail change still needs `accepted-by`) · Check: `node --test compiler/test/policy-write-protection.test.mjs`
Finding: nothing denies edits to `docs/guardrails/*.md`, which are read live, so an agent can set `status: superseded` or add a `free=` entry; the approvals store can be forged by an inline `node -e` script or `cd` plus a relative `cp` because tokens resolve against the project, not the shell directory (`hook.mjs:385-389`, `611`).
Red: tests for (a) Edit/Write of an active guardrail file is asked or denied, (b) `sed -i` and a shell redirect into it likewise, (c) a `cd <store-parent> && cp x y` and a `node -e` string that names the store are caught or the store is verified. Fails today.
Do: add `docs/guardrails/` (active files) and `docs/decisions/` accepted files to the default write-gated set (a human approves, as for generated files); for the store, replace path-token matching with a content check at read time (the store carries an HMAC key held outside the project, so a forged entry is ignored), or deny any command whose resolved working directory is inside the store. Pick one in the decision and say why.
Done-when: the tests pass; a forged store entry grants nothing.
Red 2026-11-08 (commit 555baa9): `node --test compiler/test/policy-write-protection.test.mjs`: 3 of 4 fail (Write/Edit and `sed -i`/redirects on an active guardrail not stopped; `cd <store-parent> && cp x <store>/approvals.json` passes); the no-false-block case passes.
Green 2026-11-08: 4 of 4 pass; `npm test` 1368 pass; `check:generated`, `check:guardrails` ok; `eval bypass` unchanged (47 of 49). The store is guarded by position and name (cwd-tracked operands, inline scripts naming `approvals.json`/`pending.json`), not a key: the decision draft `draft-h4-policy-files-and-approvals-store-are-not-agent-writable` says why. **Open:** the owner accepts the draft; the hook logs the stop under class `policy-write` with no guardrail label until a guardrail `policy-files-human-edited` is accepted (needs `accepted-by`); computed paths (`node -e` with joined segments) are not seen. No bypass classes added.

## Phase 2 — The gate matches what the shell runs

### H5 Command-word normalisation in the gate — [ ] ‖
Class: implement · Effort: high · Needs: H1 · Check: `node --test compiler/test/gate-normalisation.test.mjs`
Finding (`gate.mjs:15,165-205,262`): only a command word written exactly `git`, `gh` or `rm` is matched. Misses: `/usr/bin/git push --force`, `command git push`, `nohup git reset --hard`, `timeout 9 git rebase main`, `git 'push' -f`, `g\it push`, `git --work-tree . reset --hard`.
Red: one case per spelling, each with the gate catalog's existing entry it must hit, asserting `ask`/`deny` as for the plain spelling; plus a no-match set (`echo git push`, `grep -r "git push" .`, `git-lfs pull`) asserting no false block. Bypass classes added for each spelling, predicted `blocked`.
Do: before matching, reduce the command word to its base name, strip the wrappers `command`, `nohup`, `timeout N`, `time`, `nice`, `exec`, `env`, `sudo`, `doas`, `xargs`, unquote and unescape the word and the subcommand, and accept git global flags that take a value (`-C`, `--git-dir`, `--work-tree`, `-c`, `--namespace`) before the verb. An unparseable command is treated as matching the strictest candidate, not as no match.
Done-when: all spellings are caught; no-match set stays unprompted; M5 does not rise (compare `telemetry summary` over the eval corpus).

### H6 Stateful checks read the right repository and the right branch — [ ] ‖
Class: implement · Needs: H5 · Check: `node --test compiler/test/gate-state-targets.test.mjs`
Finding: `parseGit` honours `-C` but not `--git-dir`/`--work-tree` (`gate-state.mjs:15-24`); the rebase check takes the second non-flag word as the branch, so `rebase --onto main HEAD~2` and `rebase -x "echo a b" main` misjudge a published branch, and `--exec` runs uninspected commands (`:61-66`); `reset --hard HEAD~5` on a clean tree is judged safe (`:53-57`); the `rm -rf` temp exemption is escaped by `/tmp/{x,../home/u/proj}` and `/tmp/$(echo ..)/` (`gate.mjs:27-31`).
Red: a test per sentence above using scratch repositories (a published branch, an unpublished branch with commits, a clean tree), asserting the judgement a human would make. All fail today.
Do: resolve the target repo from `-C`, `--git-dir`, `--work-tree` and `GIT_DIR`; parse rebase arguments by their grammar and always ask for `--exec`/`-x`; treat `reset --hard <rev>` as unsafe when the current branch has commits not on a remote; reject any `rm` target containing `..`, braces, `$(`, backticks or `$` under the temp exemption.
Done-when: all cases pass.

### H7 Path deny normalises tokens — [ ] ‖
Class: implement · Needs: H1 · Check: `node --test compiler/test/deny-path-normalise.test.mjs`
Finding (`hook.mjs:96-130`, `glob.mjs:19`): `cat .en?`, a `stat*` glob in the state directory, `x/../` before an anchored pattern, `f=.e; cat ${f}nv` all escape; an unlisted tool has all of its input scanned as paths, so prose that merely names a restricted file is denied (a reviewer's report was refused twice).
Red: cases for each escape asserting denial; and false-positive cases (a message that names `.env` in prose, a commit message, a subagent report) asserting no denial.
Do: normalise `..` for relative and absolute tokens; treat a token containing `*?[` or `$` as possibly matching and ask a human when a restricted pattern could match it; list the unlisted tools by class (path-bearing vs text-bearing) so text-bearing inputs are not path-scanned.
Done-when: escapes denied, prose passes. M1 falls by the escape count; M5 falls by the prose false blocks.

### H8 Checkpoints and the first apply do not leak or clobber — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/checkpoint-restricted.test.mjs compiler/test/apply-first-run.test.mjs`
Finding (the first-apply clobber was found independently by the test review: `apply.mjs:597-623` skips the foreign-file loop when no manifest exists, so `.githooks/pre-push`, `.github/CODEOWNERS`, `.opencode/plugins/go-getter.js` and `.claude/agents/*.md` are overwritten): the unit checkpoint is `git add -A` pushed to a remote, filtered by secret patterns only, so an untracked restricted file (env file, key, keystore) is pushed (`work/recovery.mjs:26-29`, `checkpoint.mjs:34`); a first `apply` with no manifest overwrites a user's own `.githooks/pre-commit` without `--force` (`apply.mjs:597-623`); approvals-store updates lose writes under concurrency (`secrets/approvals.mjs:74-78,156-161`); release writes are non-atomic (`release.mjs:94,101,196`); `secret-scan` file attribution can be spoofed by an added line starting `++ b/` (`secret-scan.mjs:23-24`).
Red: five tests, one per sentence: a snapshot of a tree with an untracked env file excludes it; a first apply over an existing foreign hook refuses without `--force`; 20 parallel store writers lose none and a revoke is not lost; a killed release leaves the old file intact; a spoofed header line is reported under its real file.
Do: exclude restricted patterns from snapshots; treat any existing file without a manifest entry as foreign; lock the store (create-exclusive lock file with a stale timeout); write via temp file and rename; parse diff headers only at hunk boundaries.
Done-when: five tests pass. (Split into five PRs if the diff is large; `guardrails: one change per branch`.)

### H12 A write to a generated host file is stopped at tier 2 — [ ] ‖
Class: implement · Needs: H1 · Check: `node compiler/bin/go-getter.mjs eval bypass`
Finding (from H1): `generated-host-files-not-hand-edited` is tier 3 only (`npm run check:generated` in CI), so no hook stops an agent writing `.claude/settings.json` or another generated host file; class `T2-cwd-subdir-write-generated` is predicted `blocked` and observed `passes`.
Red: a hook test that a Write or shell redirect to each generated path (from the apply manifest) is denied or asked. Fails today.
Do: add a tier-2 `deny-path`/write gate from the manifest's generated paths (a person can still approve), or record in a decision that tier 3 is the intended control and lower the claim.
Done-when: the test passes and the bypass class is observed `blocked`.

## Phase 3 — Honest coverage and a usable surface

### H9 One source of truth for host capability, checked — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/docs-consistency.test.mjs`
Finding: fact `0009` row 9 gives Codex, Kilo, OpenCode and Cursor checkpointing tier 1 while `compiler/capabilities/{kilo,opencode,cursor}.json:65` say 2; fact 0009 says Codex replaces output only with a block reason while `codex.json:30` sets `rewriteOutput: true`; Copilot is `hook` for components 7 and 11 although `copilot.json:35,49,57,66` mark the command field unconfirmed, `modelSwap:false` and no spend source; component 10 is shown advisory although fact 0009 gives tier 2; the README coverage table shows deferred hosts (Codex, Cursor, Gemini CLI, Copilot; `hosts/registry.mjs:13-18`) the same as Claude Code.
Red: a check, `go-getter check docs-consistency`, that compares fact 0009's matrix with `capabilities/*.json` and the README coverage table with `go-getter coverage` output, run on the current tree. It must fail with the rows above. M3 and M4 baselines are the failure counts.
Do: generate the README table from `coverage` (so it cannot drift); mark a cell `unconfirmed` or `deferred` where the capability file or adapter says so; lower Copilot 7 and 11 to tier 1 until a real payload confirms the field, or record the evidence; correct fact 0009.
Done-when: the check passes in CI; M3 = 0, M4 = 0.

### H10 The README and help tell the truth — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/readme-facts.test.mjs`
Finding: README says status v0.4.1 and "sanitization pack (0.6.0)" while the package, plugin manifests and CHANGELOG say 0.5.0; the Develop paragraph is duplicated and links `docs/plans/v0.2-agent-core-hardening.md` (it is under `archive/`); "all eight packs" with ten harness packs listed; v0.2/v0.4 promises are stale; help is one `usage:` line; the `hook`, `update` and `interview` usage strings omit or misstate arguments (`command-table.mjs:44-50`).
Red: a test that reads the README version, relative links and pack counts and checks them against `package.json`, the filesystem and `packs`; a test that every public verb has a one-line description and that each usage string parses the arguments its handler accepts. Both fail today.
Do: fix the README; add a description per verb to `go-getter` help and to `command-table.mjs`; correct the usage strings; make `apply --remove` and the `uninstall` skill point to each other in INSTALLING.md.
Done-when: both tests pass.

### H11 Redesign the verb system — [x]
Class: plan · Effort: high · Needs: H10 · Human: the owner accepts the decision draft `draft-verbs-the-verb-system-is-nouns-actions-and-recipes` (closed set of 21 nouns, atoms as `noun action`, recipes in `compiler/recipes.json`) · Check: `npm run check:plans`
Do: owner review of the draft; then it is split into V1 to V6 below. Nothing in V1 to V6 starts before acceptance.
Done-when: the decision is accepted (or superseded by an edited one) and V1 to V6 carry issues.
Result 2026-11-08: the owner accepted the draft in layers: V1 (table, descriptions, fixed usage) first, then V2 (aliases), then V3 (recipes, admitted by owner mark or three telemetry occurrences); the top-level surface is 12 recipes plus `help` (M6). The decision file stays `draft` until `accepted-by` is set.

## Phase 4 — The verb system (after H11 is accepted)

Measures: M6 = public top-level words in `go-getter help` (today 40; target at most 12 recipes plus `help`), M7 = atoms with no summary or with a usage string that differs from the handler's (today: at least `hook`, `approvals`, `check`, `render-pack`, `reconfigure`; target 0), M8 = old spellings that do not print their replacement (target 0).

### V1 The command table becomes the single source — [ ]
Class: implement · Needs: H11 · Check: `node --test compiler/test/verb-table.test.mjs`
Red: the test loads the table and fails because rows lack `noun`, `action`, `effect`, `summary`, `writes`; it also asserts no duplicate `(noun, action)`, actions inside the vocabulary, every handler has a row and every row a handler, summaries at most 80 characters, no two atoms with overlapping `writes`, and each row's usage equals the handler's `USAGE`. Fails today on the five known drifts.
Do: generate usage and help from the table; read `USAGE` from it in each handler; keep the old names as rows flagged `deprecated: <new spelling>`.
Done-when: the test passes; M7 = 0.

### V2 Noun-action spellings with deprecated aliases — [ ] ‖
Class: implement · Needs: V1 · Check: `node --test compiler/test/verb-aliases.test.mjs`
Red: for every old form in the decision's mapping, the old spelling and the new one give the same result and exit code, and the old one prints `use: go-getter <new>` on stderr. Fails because the new spellings do not exist.
Do: add the noun layer in the dispatcher (no handler is rewritten); update `raw-commands-redirect-to-verbs`, the gate catalog patterns and `doctor`'s allow-rules to the new names, with both spellings matched until the aliases are removed.
Done-when: M8 = 0; gate tests for both spellings pass.

### V3 Recipes file, expansion and `--plan` — [ ]
Class: implement · Effort: high · Needs: V1 · Check: `node --test compiler/test/recipes.test.mjs`
Red: tests that (a) `compiler/recipes.json` lists only existing atoms, (b) `explain <recipe>` prints the expansion and the maximum effect class, (c) a forced failure at atom n leaves 1..n-1 done, runs nothing later and prints the resume command, (d) a second run does not repeat a push or merge already done, (e) the recipe's gate is the union of its atoms' gates.
Do: a small runner that executes the atom list in order; `ship` and `pr` are re-expressed as recipes with their existing tests unchanged (0163 holds); then `start`, `finish`, `status`, `setup`, `health`, `undo`, `adopt`, `sync`, `release`.
Done-when: all five tests pass for each recipe; the existing `ship`/`pr`/`release` tests still pass unchanged.

### V4 Evidence-based recipe admission — [ ]
Class: implement · Needs: V3 · Check: `node --test compiler/test/recipe-evidence.test.mjs`
Context: needs the telemetry guardrail-id and approval-class records of `paper-instruments.md` P2 and P3 (done). Red: the test feeds a telemetry fixture and expects `report show --sequences` to list a sequence run three times in a window and not one run twice; and expects `check recipes` to fail a recipe that has neither evidence nor an owner mark.
Do: the sequence report (verbs only, no arguments or content, `telemetry-records-metadata-only`) and the admission check.
Done-when: both cases pass; the check runs in CI.

### V5 Help that costs few tokens — [ ]
Class: implement · Needs: V1 · Check: `node --test compiler/test/help-budget.test.mjs`
Red: `go-getter help` is at most 30 lines and lists recipes first; `help <noun>` at most 30 lines; every atom has `--json` with a documented schema; exit codes 0/1/2/3/4 as the decision fixes. Fails today (one `usage:` line, no `--json` on most atoms).
Do: generate help from the table; add `--json` to the atoms that lack it; unify exit codes.
Done-when: the test passes; M6 at target.

### V6 Remove the deprecated aliases — [ ]
Class: implement · Needs: V2 · Check: `node --test compiler/test/verb-aliases.test.mjs`
Do: wait two minor releases after V2 ships, then remove the old spellings through a superseding decision.
Done-when: the table has no `deprecated` rows.

## Phase 5 — The test suite

Findings of the three test-suite reviews (2026-11-08; 154 files, 1301 tests, all green). The suite is strong on exact values through public contracts, and weak on hermeticity and on the gaps this plan closes. Measures: M9 = tests that touch the real checkout, real home or real `gh` (today at least `dogfood-gates`, `digest`, `metrics-day-edges`), target 0; M10 = copies of the guardrail-text builder (today about 21), target 1; M11 = tests that pass on any error or accept either outcome (today about 12 listed in Q3), target 0.

### Q1 Hermetic tests — [x] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/hermetic.test.mjs`
Finding: `dogfood-gates.test.mjs:16,31,35` run `evaluatePreTool` on the real checkout, which writes refs under `refs/go-getter/checkpoints`, prunes the developer's real checkpoints, and appends to the real telemetry and stop logs; `GO_GETTER_HOME` is unset in `gate-identity`, `store-hardening`, `redirect-hook`, `gate-hook`, `hook-fields`, so `storeDir()` is the developer's real state; `digest:179` and `metrics-day-edges:123` run the real `gh`; transcripts are read from `os.homedir()`; `measure-generated-share:50`, `capability-tags:84`, `cost-routing-pack`, `frontmatter:109`, `coverage:107`, `delegate:11`, `update:139` read live repo docs or prices; git runs without `cleanGitEnv` in about 12 files (a global `commit.gpgsign=true` breaks `checkpoint.test:20`); children start as `'node'` not `process.execPath` (7 files); temp prefixes `go-getter-`, `captags-`, `k5-`, `plan-stale-` escape `tmp-cleanup.mjs`, which removes only `gg-*`.
Red: a global guard (`--import` file) that fails any test which writes under the real `$HOME`, the real repo's `.git`, `refs/go-getter`, or runs `gh`/`git` outside a temp dir or with `GIT_DIR` set, and sets `GO_GETTER_HOME` to a temp dir for every test. It must fail on the files above before they are fixed.
Do: fix each file to use temp repos, a per-test `GO_GETTER_HOME`, `cleanGitEnv`, `process.execPath`, the `gg-` prefix, `try/finally` cleanup, and fixtures instead of live docs.
Done-when: the guard is on in `npm test` and green; M9 = 0.
Red 2026-11-08 (commit b2e1a4a): `npm test` with `compiler/test/support/hermetic.mjs` preloaded: 107 failing tests. It named `dogfood-gates` (writes the checkout's telemetry log), `digest:176` and `metrics-day-edges:117` (real `gh pr list`), plus bare `'node'` children, non-`gg-` temp prefixes, `git` in the checkout (`merge-queue`, `apply`, `orchestration-pack`) and real `gh` in `gate-stop`, `gate-floor`, `telemetry-approval-class`, `work-claim`.
Green: `npm test` 1335 pass, 0 fail with the guard on; `node --test compiler/test/hermetic.test.mjs` passes; `check:generated`, `check:guardrails`, `eval` and `eval bypass` (45 of 46 as predicted) unchanged. The guard sets `HOME` and `GO_GETTER_HOME` to a temp dir, puts a recording `gh` first on PATH, and fails the test that writes under the real checkout or home, runs the real `gh`, runs `git` outside a temp dir, spawns bare `node`, or makes a non-`gg-` temp dir. Left for Q2 and Q3: tests that read live repo docs or prices (`measure-generated-share`, `capability-tags`, `cost-routing-pack`, `frontmatter`, `coverage`, `delegate`, `update`); they only read, so the guard cannot see them.

### Q2 One fixture library — [ ] ‖
Class: implement · Needs: none · Check: `node --test compiler/test/support-fixtures.test.mjs`
Finding: CI evidence 2026-11-08: `tracker-github.test.mjs:132` failed with `ENOTEMPTY` on cleanup of its temp directory in the `verify-test` job of pull request 348, a docs-only change (a rerun passes); the cleanup is not in a `finally` and a child process was still writing. Also: the guardrail-frontmatter builder is copied about 21 times (`gate-hook:12`, `redirect-hook:11`, `gate-stop:13`, `gate-floor:23`, `checkpoint-hook:13`, `restricted-operands:18`, `hook-fields:19`, `hook-redaction:24`, `approvals:26`, `secret-approval:23`, `gate-identity:20`, `outward-approval:48`, `gate-state:101`, `hook-commands:20`, `apply:17`, `manifest:10`, `check-stages:16`, `enforcement-origin:10`, `spec-tool-coexistence:20`, `sandbox:13`, `verification-gate:210`); six `gh` stand-ins (`fake-gh.mjs`, `gh-stub.mjs`, `ci-status:24`, `work-claim:376`, `ship:226`, the merge-queue fake); three fake Jira servers; the `world()` builder four times; the golden updater five times; env save and restore six times; every scratch `chmod`s the shared `fake-gh.mjs`, changing the source tree.
Do: `support/guardrail.mjs`, `support/scratch-repo.mjs` (incl. `release-scratch`), one `support/gh.mjs`, one `support/jira.mjs`, `support/world.mjs`, `support/golden.mjs`, and `withEnv(vars, fn)` with `finally`.
Red-green: a count test that fails while a second definition of any of these exists in `compiler/test/**` (M10).
Done-when: M10 = 1 per fixture; the test counts are unchanged (1301 or fewer by the merges in Q4).

### Q3 Strengthen weak assertions — [ ] ‖
Class: implement · Needs: Q2 · Check: `npm test`
Targets (each is a one-line change plus, where the test mirrored a bug, a red proof): `gate.test:47-50` locks `sh -c "git push"` as not gated (becomes the red test for H5); `redirect-hook:60` `d.reason ?? ''` lets a silent allow pass; `gate-hook:58,98`, `gate-stop:48`, `redirect-hook:33-35` regex fragments of reasons; `work-accept:101` accepts `failed` or `none`; `tracker-jira:220`; `telemetry-approval-class:111` (`A||B`), `:116` (`throws` with no matcher), `:53` (wall clock); `digest:181`; `pack-tiers-profiles:24,89,93` pass on any error; `cli:39` substring match on `pr`/`ci`; `interview-cli:76-80` exit code only; `update:95` (name says `--yes`, checks the dry run), `:204` `doesNotThrow`; `ship-gates-default:144,175`; `pseudonyms:93-102` vacuous `existsSync(a)||existsSync(b)`; `run-stops:131` regex over source; `release-request:95,171,175`; unchecked `spawnSync` git setup (`telemetry-approval-class:38-40`, `runner:88-92`, `work-claim:400,414`, `run-stops:84`, `jira-live-script:105`); fake `claude` in `ship.test:193` never reads stdin (flaky `--review` path: have it `cat >/dev/null`, and have `ship.mjs:42` report the real spawn error instead of exit 1).
Done-when: M11 = 0; each changed test fails when its target behaviour is broken by hand once (recorded in the PR).

### Q4 Merge, move and split — [ ] ‖
Class: implement · Needs: Q2 · Check: `npm test`
Do: merge `gate-ship` into `gate`; `manifest` into `apply`; `enforcement-origin` into `checks`; `pack-answers-roundtrip` into `pack-answers-variants`; `git-env` with `context-pack`; `worktree-release` scratch into `release-scratch`; `metrics-day-edges` into `metrics-day`; `telemetry-guardrail-id` and `telemetry-retention` into `compiler/test/telemetry/`; move the four `interview --defaults` tests out of `digest`; move worktree tests out of `orchestration-pack` and hook-mode tests out of `governance-pack`; split `gate.test:94-114,131-144` (about 15 assertions each); rename `work-claim` cases from review codes (H3, M9, N1) to behaviours and `update/review-fixes` to the behaviours it holds; replace per-pack "valid, covers component N" and "every answer renders" boilerplate (six and six copies) by one table over all packs.
Rule: a merge keeps every assertion; the test count may fall only where two tests assert the same thing, and the PR lists them.
Done-when: the same set of assertions passes; the count change is explained in the PR.

### Q5 Goldens that lock structure, not prose — [ ] ‖
Class: implement · Needs: Q2 · Check: `npm test`
Finding: `git-workflow-pack:72`, `hitl-pack:86` and `verification-gate-pack:369-388` (including pinned action SHAs) force a blind golden update on any wording edit.
Do: keep byte goldens for fixture packs only; for shipped packs assert structure (tiers, run lines, `governed-by`, ids). Keep one golden per host for the generated host files, which is the contract.
Done-when: a wording-only edit of a shipped pack changes no test; a tier or run change does.

### Q6 Missing tests the reviews listed — [ ] ‖
Class: implement · Needs: Q1 · Check: `npm test`
Add, each red first against the current code where a defect exists, otherwise as a characterisation test: release (crash between push, PR and merge then resume; atomic request file; two sessions claiming one request; TTL at exactly `REQUEST_TTL_MS`; `waitForCi` timeout exit 3); claims (heartbeat racing a takeover; push retries exhausted; skew at exactly the 5-minute margin; host date behind); merge queue (runner dies holding the lease; bisect with two culprits); worktree (a fresh lock blocks); telemetry (two processes appending; torn final line); spend (`settleSpend` twice at once); watch (the hourly cap resetting); update (interrupted apply with the manifest written before the files); tracker (gh rate limit or 403 distinct from offline); `detect` with a malformed `package.json`; `doctor --hosts` with an unknown host (exit 2, not a throw); `apply` outside a git repo; hook with `payload.cwd` (covered by H1).
Done-when: the list is covered; defects found are filed as steps here.

### Q7 Coverage as a gate — [ ] ‖
Class: implement · Needs: Q1 · Check: `npm run test:coverage`
Red: `node --test --experimental-test-coverage` is run once and its per-file line and branch figures recorded; files under `compiler/src/hook.mjs`, `gate*.mjs`, `shell.mjs`, `apply.mjs`, `release.mjs`, `ship.mjs` below 90% branches are listed.
Do: add `test:coverage`; set a per-file floor for the enforcement files (ratchet: the floor is the figure recorded now, raised as tests land, never lowered); CI runs it.
Done-when: the floor is in CI and no listed file is below it.

## Phase 6 — UX, determinism, reliability and tokens

Each item is a step with a red test; ordering is by value. Read `docs/facts/0040-oct-31-throughput-baseline-and-friction.md` first. Metric for the phase: human minutes per merged outcome (`metrics day`, decision 0154) and tokens per merged outcome (`telemetry summary`); direction down; falsifier: either rises over a 30-pull-request window.

### U1 `go-getter status` is the first command and the last — [ ]
Class: implement · Needs: V3 · Check: `node --test compiler/test/status-recipe.test.mjs`
Do: one screen of at most 12 lines: next step, what waits for a person, what is red, drift, and the single command to run next ("do this: ..."). Every error message in every verb ends with the one command that fixes it (a table-driven test over all error paths asserts a `try:` line).

### U2 Deterministic output — [ ]
Class: implement · Needs: V1 · Check: `node --test compiler/test/determinism.test.mjs`
Red: run each read verb twice on a fixture and diff; fail on any timestamp, absolute path, random id or unordered list in the default output. Do: sort, relativise, put times under `--json` only.

### U3 Token budget per verb — [ ]
Class: implement · Needs: V1 · Check: `node --test compiler/test/output-budget.test.mjs`
Red: a budget (lines and bytes) per atom in the table; the test fails on any atom above it on a fixture. Do: compact default, `--json` and `--full` for the rest; skills and generated instruction files get a size budget too (`instruction-file-within-cap` already holds for the main file; extend it to each skill's `SKILL.md`, with the long text moved to on-demand references). Measure: bytes of instruction text loaded at session start, before and after (command: `go-getter report show --context`).

### U4 Zero-config first run — [ ]
Class: implement · Needs: H3, V3 · Check: `node --test compiler/test/setup-recipe.test.mjs`
Do: `go-getter setup` with no questions asks nothing it can detect, uses recommended defaults, prints a 5-line summary and what it chose, and is reversible (`host remove`). Target: median questions-to-first-plan at most 8 (the outcome brief `faster-plan-start`, meter `questions-to-first-plan`).

### U5 One rollback story — [ ]
Class: implement · Needs: V3 · Check: `node --test compiler/test/undo.test.mjs`
Do: every outward or destructive recipe takes a snapshot first (already true for `ship`), `undo` lists them with dates and restores one, and `host remove` and the `uninstall` skill point to each other.

### U6 Idempotent and resumable by default — [ ]
Class: implement · Needs: V3 · Check: `node --test compiler/test/resume.test.mjs`
Do: every recipe writes a small state file after each atom (local, gitignored, metadata only); rerunning continues; `--from <atom>` restarts at one. Red: kill the process at each atom boundary and rerun.

### U7 Honest status of each host — [ ]
Class: implement · Needs: H9 · Check: `go-getter check docs-consistency`
Do: `host show` prints per host and component `confirmed | unconfirmed | deferred`, with the evidence link; the README table is generated from it; a host with an unconfirmed shape cannot be shown as `hook`.

### U8 Telemetry that answers "what should we fix next" — [ ]
Class: implement · Needs: none · Check: `node --test compiler/test/report-next.test.mjs`
Do: `report show --friction` lists, from metadata only, the guardrails with the most overridden denials, the atoms with the most failures and the recipes with the most stops, ranked; it feeds recipe admission (V4) and the false-block rate (M5).

### U9 A conformance suite per host — [ ]
Class: implement · Needs: H9 · Check: `go-getter eval hosts`
Do: for each host, a recorded real payload per hook event (captured once from the real host, committed as fixtures) replayed through the compiled hook; unconfirmed shapes become confirmed or stay labelled. This is what lets the paper and the README claim coverage.

### U10 POSIX-only stance — [ ]
Class: implement · Needs: H3 · Check: `node --test compiler/test/platform.test.mjs`
Result 2026-11-08: the owner chose POSIX only (macOS, Linux, WSL), failing early.
Red: on a simulated `win32` platform `doctor` and `setup` exit non-zero with one message naming WSL; INSTALLING.md states the requirement (a docs test greps it). Fails today.
Do: add the platform check and the sentence.
Done-when: the test passes.

## Where to resume (2026-11-08, end of session)

- **H1** is coded and green in pull request #351 (branch `fix/hook-policy-from-project-root`, issue #352). **H2** is coded and green in pull request #353 (branch `fix/hook-fail-closed`, no issue yet). Neither is merged. Both change `compiler/src/commands/hook.mjs` (the second to merge may need a rebase) and both edit this plan file (expect a trivial conflict in the H1/H2 lines).
- **Owner actions waiting:** none blocking. #351, #353 and #354 (H1 to H3) are merged and 0208 is accepted. Issues are optional: steps proceed without them.
- **Next step, in order:** H3 (`doctor` checks; independent of H1/H2, branch from the updated `master`). H4 is coded (this branch). Then H5 to H8 in parallel. H12 (a tier-2 gate for writes to generated host files) follows H1; it came from the one H1 bypass class that still passes.
- **Known facts to carry:** the verbs `go-getter host check --fix` and `go-getter approval create --once` named in H2's UX rule do not exist; the block message uses `go-getter doctor` and `go-getter approvals allow <shape>` until V1/V2. Agents may not run `go-getter hook ...` directly (a guardrail denies it); tests spawn it from `node:test`. A tool call whose text names a restricted file in prose is denied (H7's false positive): build such names at runtime in scripts and tests.
- **Each step:** branch `fix/<slug>` from `origin/master`; red test first and run; record `Red:`/`Green:` lines here; `npm run build`, `npm test`, `node compiler/bin/go-getter.mjs eval bypass`; red commit, then fix commit; `go-getter pr`.

## Order

H0 first, and Q1 alongside it (hermetic tests make every red result trustworthy). H1 next. Then H2, H3 and H4 (H4 after H1). H5 to H8 in parallel after H1. H9, H10, Q2, Q3, Q5 are independent and can start any time. Q4 and Q7 after Q2/Q1. H11 for the owner's review; V1 to V5 after acceptance, then U1 to U9 by value (U1, U4 first); V6 two minor releases later.

When all steps are green: `go-getter eval bypass` reports every added class as predicted, M1 to M4 are at target, M5 has not risen, and the paper's intervention entries name the commits. Then re-run the review's two reads (enforcement core and host/usability) with fresh-context reviewers and record the new scores here.
