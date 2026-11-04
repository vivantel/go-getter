# Automation-first gates — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Split out of the former single `roadmap.md` on 2026-11-03 (decision 0165, plan `work-coordination.md`). Step text, ids and issue numbers are unchanged. The product-level index is `docs/plans/roadmap.md`. `Needs` lists ids in this plan only; a dependency on another plan is written in the step's Context until `work-coordination.md` step K1 makes `plan#id` parse. Live state of a step follows decision 0166 once K2 lands; until then update the marker and `Progress` line in place as before.

## Phase 0 — Automation-first gates

Decision `docs/decisions/0159-a-human-is-asked-only-when-an-action-would-destroy-something-unrecoverable.md` fixes the design; read it first (it supersedes 0120 and narrows 0095). The hitl pack (`src/packs/hitl/`) and the gate (`compiler/src/gate.mjs`, `hook.mjs`) are where the work lands. This phase comes before the throughput phase so that `ship`, the redirect hook and the gate stack are built on the new gate model.

**Rules the design fixes (do not re-decide):** a stop depends on repository state, not the command name; production release, publish and repository settings stay human-approved; the project declares free channels, everything unlisted is production; a hook-less host runs free with a git-hook floor and a checkpoint; at most one go-getter prompt per merged PR; `reset --hard` on uncommitted work, force-push and `rm -rf` outside a temporary directory still ask.

### G1 State-checking gate — [x]
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/gate-state.test.mjs`
Context: today `gate.mjs` matches command text and the hitl pack writes native ask rules for `git branch -D`, `git reset --hard`, `git rebase` and similar (91 rules in `.claude/settings.json`). An ask rule beats an allow rule on Claude Code, so a state-dependent command must not get a native ask rule.
Do: add a state check to the gate for the commands whose danger depends on state: `git branch -D` (safe when the tip is reachable from a remote branch, the default branch or a merged PR), `git reset --hard` (safe on a clean tree), `git rebase` (safe on a branch with no remote counterpart), and removing a clean worktree. Drop their native ask rules; the hook decides, asking where the host supports a hook ask and denying with the guide (G3) where it does not. Commands whose danger is not state-dependent keep their rules.
Done-when: tests show each safe case running without a stop and each unsafe case (a branch with unpushed commits, a dirty tree, an unpublished rebase target) stopping, and `go-getter apply --check` clean with the dropped rules gone from the generated settings.
Progress 2026-11-02 · `feat/state-checking-gate-g1` · `../go-getter-wt/gate-state` · done: `compiler/src/gate-state.mjs` (branch -D, reset --hard, rebase, worktree remove), native rules dropped for them, hook asks or denies by host with the reason, `git-worktree-remove` added to the catalog, `apply --check` clean and the dropped rules gone from `.claude/settings.json` · next: ship; G3 supplies the guide text for hosts that cannot ask.

### G2 Free release channels — [x] ‖
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/release-channels.test.mjs`
Context: the catalog has `release-create`, `package-publish`, `git-tag-create` and `repo-settings` (`compiler/src/gate.mjs`); decision 0159 item 2.
Do: add a hitl pack answer `free-channels` (a list such as prerelease versions, npm dist-tags or named stage environments; empty by default, recommended default stays production-gated); a release or publish to a listed channel runs without a human and anything unlisted stays gated; creating a tag is free. Regenerate the guardrail and decision records from the pack.
Done-when: tests show a listed channel released without a stop, an unlisted channel stopping, a tag created freely, and `repo-settings` still gated.

### G3 A stop that guides and is logged — [x]
Class: implement · Effort: high · Needs: G1 · Check: `node --test compiler/test/gate-stop.test.mjs`
Context: the redirect and denial messages come from `compiler/src/hook.mjs`; approvals live in `approvals` (decision 0130 run grants); telemetry records metadata only (`telemetry-records-metadata-only`).
Do: every stop prints what would be lost, the safe alternative (a verb, or a checkpoint taken first) and an approve-and-remember choice that records an approval so the same case does not ask again; each stop is logged as metadata (command class, reason, outcome), never command text or content.
Done-when: tests show the message carrying loss, alternative and the remember choice, a remembered approval not asking twice, and a log record with no command text.

### G4 Hook-less host floor — [x]
Class: implement · Effort: medium · Needs: G1 · Check: `node --test compiler/test/gate-floor.test.mjs`
Context: Copilot, Kilo and OpenCode have no blocking pre-tool hook (see the enforcement debt in `docs/plans/archive/v0.2-agent-core-hardening.md`); decision 0159 item 3.
Do: on a host without a blocking hook, write no ask rules for state-dependent commands and rely on the git-hook floor plus a checkpoint taken before the action; `go-getter coverage` shows the tier per host and what remains unprotected.
Done-when: tests show no ask rule written for the three hosts, a checkpoint taken before a state-dependent command where the host can run one, and `coverage` stating the residual risk.
Progress 2026-11-04 · `feat/hookless-host-floor` · done: capability `hooks.gateFloor` (Copilot, Kilo, OpenCode; these have a blocking hook but cannot ask, so the plan's "hook-less" is read as "cannot ask and has no native rule for these commands"), the hook lets a state-dependent command run after a checkpoint and logs it as `allowed:floor`, `coverage` prints the tier per host and the residual risk, `compiler/test/gate-floor.test.mjs` · next: none.

### G5 Ask-point audit and the prompt counter — [ ]
Not blocked (decision 0182): audit today's ask points; `work-coordination.md` K11 later adds the parked-ask queue (K7) to the inventory.
Class: review · Needs: G1, G2, G3 · Check: `go-getter:lint`
Do: inventory every point where go-getter asks a human (native ask rules, hitl gates, interview questions, defaults); record for each what it protects and whether it can be freed, defaulted or removed; apply the changes that decision 0159 already allows; record the rest as steps here or as superseding decisions, one at a time; and record the result as a fact. `go-getter metrics day` (T1) reports prompts per merged PR from the stop log of G3.
Done-when: a fact lists every ask point with its disposition, no ask point is left without a stated protection, and the prompt rate is reported.

### G6 Say the promise — [ ]
Class: implement · Needs: G5 · Check: `npm run check:plans && npm run check:guardrails`
Do: state the automation-first promise and the one-prompt-per-merged-PR budget in the README tagline area and in INSTALLING.md, describe the free-channels answer, and run the full `go-getter:lint` skill.
Done-when: lint reports no errors and the README states the budget and where it is measured.

### G7 Ship runs unprompted in a default project — [x]
Issue: #254
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/gate-ship.test.mjs compiler/test/dogfood-gates.test.mjs`
Context: `shipGated` in `compiler/src/gate.mjs` gates `go-getter ship` unless git-push, pr-create and pr-merge are all in the gate's `free` list. The hitl pack's `free-commands` defaults to empty, so a new project stops on every `ship` while the redirect hook (`raw-commands-redirect-to-verbs`, T4) sends the agent from raw commands to it. `run-grants` already defaults to git-push, pr-create, pr-merge and pr-close, the shapes a remembered approval or run may allow. Decision 0159: ask only when something cannot be undone; `ship` checks, takes a checkpoint and merges only on green. This repo already frees the three parts by its own answers (decisions 0160, 0161), so its behaviour does not change; the bug is the default.
Do: gate `ship` only when one of its three parts is neither freed nor grantable (`gateArgs` already parses both lists). Keep the stop for a project that deliberately lists none of them. Regenerate with `go-getter apply`; the generated host files, AGENTS.md and plugin copies must stay in sync.
Done-when: tests show a default hitl project (nothing freed, default grants) does not gate `ship`; a project whose grants omit pr-merge still gates it; the redirect hook is not active while `ship` is gated (a doctor or hook test); `check generated|neutral|guardrails` and `npm test` pass.
Progress 2026-11-02 · `fix/ship-default-no-stop` · merged in #255 (`38dd5cd`) · done: `shipGated` counts grantable parts, redirect hook off while `ship` is gated, tests added, `npm test` and checks green · next: none.

### G8 Plan state reads the default branch — [x]
Issue: #261
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/plan-stale.test.mjs`
Context: on 2026-11-02 `go-getter plan next` listed T6 and T7 as open from a feature branch that predated their merge (#258-#260), because it reads `docs/plans/` from the working tree. An agent then reported finished steps as pending. Open work is meant to come from the shared source (issues, default branch), not from whichever branch is checked out.
Do: make `go-getter plan status|next` compare the working tree's plan files with the default branch's (`git fetch`, then `origin/<default>`); when the branch lacks commits that touch `docs/plans/`, print a warning naming the branch and the number of commits behind, and in `status --json` add a `stale` field (`next --json` stays an array; the warning goes to stderr). Offer `--from-default` to read the plan from the default branch. Read-only: no checkout, no write. Do not fail when offline; say the check was skipped.
Done-when: tests with a temporary repo show a behind branch producing the warning and `stale: true`, an up-to-date branch producing neither, `--from-default` returning the default branch's step states, and an unreachable remote comparing with the last fetch and saying so.

