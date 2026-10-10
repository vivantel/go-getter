# Git workflow pack (SDLC) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`.

Written 2026-10-10 from an interview with the repo owner (`sergemso`) for backlog item L.1 of `docs/plans/v0.2-agent-core-hardening.md`. Decision: `docs/decisions/0099-git-workflow-pack-covers-branches-commits-and-prs.md` (read it first; it fixes the design). Related: 0068 (milestone order), 0009 (tiered enforcement), 0024 (this repo's local no-AI-lines rule, not part of the pack), the pack procedure `docs/skills/adding-a-practice-pack.md`.

## What you are building (read first)

An SDLC-family `git-workflow` pack, rendered by `go-getter render-pack` like the harness packs. Questions: the branch name pattern (default `type/slug`), the default-branch rule, and `Refs:` trailers (required / encouraged / off, default encouraged). Fixed rules, not questions: Conventional Commit subjects, squash merge, CI green before merge, one change = one branch = one PR with the slug as the change id. Enforcement: tier 3 git hooks (pre-commit and pre-push) and CI for branch name and no direct commits to the default branch; tier 1 instruction elsewhere.

Existing pieces to reuse: builtin checks `branch-name` (pattern and allow list) and `commit-message` in `compiler/src/checks/builtin/`; guardrail `commit-subjects-are-conventional`; the default-branch detection in `compiler/src/git-env.mjs`. Missing: a builtin that fails a commit or push on the default branch.

Working rules: never push to `master`; each step is a short-lived `type/slug` branch → PR → squash merge (`go-getter worktree new` for parallel tasks); Conventional Commit titles with `Refs:` trailers; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `practice-ships-only-after-self-adoption`, `neutral-source-has-no-host-specific-language`, `no-runtime-dependencies`, `owned-files-never-clobbered`, `pack-questions-have-a-recommended-default`.

**Rules the design fixes (do not re-decide):** scope is branches, commits and PRs; no AI-lines rule or question; no `Change:` trailer; `Refs:` never fails a commit by default; worktrees stay in orchestration.

---

### 1 Default-branch check — [x]
Class: implement · Needs: none · Check: `node --test compiler/test/checks/default-branch.test.mjs`
Do: add the builtin `not-on-default-branch` (`compiler/src/checks/builtin/`) that fails when the current branch, or in CI the PR head, is the project's default branch, with an `allow` argument for releases; register it where builtins are listed. Read the default branch through `git-env.mjs`; detached HEAD passes, as `branch-name` does.
Done-when: the test, on a temp repository, shows a commit on the default branch fails, a `type/slug` branch passes, a detached HEAD passes, and `allow` lets a named branch through.

### 2 The pack — [x]
Class: implement · Needs: 1 · Check: `npm run check:packs`
Do: add `src/packs/git-workflow/pack.json` (id `git-workflow`, family sdlc, no components), questions `branch-pattern` (text, default `type/slug`), `default-branch` (protect / instruction only, protect recommended) and `refs` (encouraged recommended, required, off), each option with a tradeoff and exactly one recommended. Outputs: a decision per answer, guardrails `branch-names-follow-the-pattern` and `no-commits-on-the-default-branch` (tier 3 `builtin:branch-name`, `builtin:not-on-default-branch`; tier 1 instruction), a `refs-trailers` guardrail only when the answer is `required` (a `builtin:commit-message` check for the trailer), a host-neutral procedure `docs/skills/working-a-change.md`, and the golden fixture and an eval case as in `docs/skills/adding-a-practice-pack.md`.
Done-when: `npm run check:packs` passes; the golden fixture shows the artifacts of the recommended path; `render-pack git-workflow --dry-run` lists them.

### 3 Adopt it in this repo — [ ]
Class: implement · Needs: 2 · Check: `npm run check:self-adoption && npm run check:generated && npm test`
Progress 2026-10-10: the pack was rendered here in step 2 (the self-adoption check requires it) and the hand-written `commit-subjects-are-conventional` was replaced by the pack's. Left: replace the interim sections.
Do: `go-getter render-pack git-workflow` here with the recommended answers (`accepted-by: sergemso`), then `apply` and `npm run build`. Replace the "Workflow (interim)" section of `AGENTS.md` and the working rules in the v0.2 plan with a pointer to the rendered procedure, keeping `AGENTS.md` within 150 lines. Reconcile `commit-subjects-are-conventional` with the pack (one statement, one job: keep one of the two) and keep decision 0024's local rule.
Done-when: `check:self-adoption` reports 9 packs adopted; pushing a branch named `wip` through the pre-push hook fails; `apply --check` is clean.

### 4 Docs, coverage and lint — [ ]
Class: review · Needs: 3 · Check: `npm run check:plans`
Do: add the pack to the README pack table and INSTALLING.md, run `go-getter:lint`, record the unconfirmed host behavior as facts, mark L.1 done in the v0.2 plan's backlog and move this plan to `docs/plans/archive/` with its INDEX row.
Done-when: lint reports no new errors; the README lists nine packs; this plan is fully `[x]` and archived.

---

## Open items (not part of these steps)

- A hosted platform's branch protection and required checks cannot be configured by the pack; the pack's CI check is the floor.
- Merge queues and rebase or merge-commit strategies are not supported; squash only.
- Decision 0068 carries `expires: v0.2.0 is released`, which has happened. It still sets the v0.3 order, so `lint` will flag it until the expiry is moved or the order is restated in a new decision.
