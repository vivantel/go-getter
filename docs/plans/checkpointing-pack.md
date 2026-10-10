# State and checkpointing pack (component 9) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`.

Written 2026-10-10 from an interview with the repo owner (`sergemso`) for step C.4 of `docs/plans/v0.2-agent-core-hardening.md`. Decision: `docs/decisions/0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions.md` (read it first; it fixes the design). Related: decisions 0094/0095 (the gated catalog this pack hooks into), 0089/0090 (the manifest: files `apply` writes are tracked), fact 0009 (component 9 tiers), the pack procedure `docs/skills/adding-a-practice-pack.md`.

## What you are building (read first)

go-getter configures a project's agent harness through host agents. You add a `checkpointing` harness pack (component 9). Before a gated command (the hitl catalog, `compiler/src/gate.mjs`) the shared pre-tool hook runs `go-getter checkpoint create`, which commits the working tree (tracked and untracked, not ignored) to `refs/go-getter/checkpoints/<time>-<label>` through a temporary index (`GIT_INDEX_FILE`, `git add -A`, `git write-tree`, `git commit-tree`, `git update-ref`), leaving the working tree, index, branches and `HEAD` untouched. The 10 newest checkpoints are kept. Restore lists what differs and changes files only with `--yes`.

Working rules: never push to `master`; each step is a short-lived `type/slug` branch → PR → squash merge (one git worktree per parallel task); Conventional Commit titles with `Refs:` trailers; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `telemetry-records-metadata-only`, `owned-files-never-clobbered`, `neutral-source-has-no-host-specific-language`, `no-runtime-dependencies` (use `node:child_process` and `git`, nothing else).

Known constraint: the hook passes `classes: []` to `matchGated` on hosts with native ask rules (`hasNativeAsk(host)` in `compiler/src/hook.mjs`) so it never denies there. Checkpointing must match the full catalog on every host, independent of that.

**Rules the design fixes (do not re-decide):** trigger = gated action (and `plan start` when the pack says so); mechanism = hidden git ref via temporary index; best effort, never blocking; 10 kept; no per-edit checkpoints; ignored files not captured; restore never deletes files and never runs without `--yes`.

---

### 1 Checkpoint core — [x]
Class: implement · Needs: none · Check: `node --test compiler/test/checkpoint.test.mjs`
Do: add `compiler/src/checkpoint.mjs` exporting `createCheckpoint(project, { label, keep })` (returns `{ ref, commit, pruned }` or `null` outside a git repository; works with an unborn `HEAD`, as a root commit), `listCheckpoints(project)` (newest first, with time, label, short commit), `pruneCheckpoints(project, keep)` and `restorePlan(project, ref)` (`git diff --name-status <ref>` plus the untracked files present now and not in the ref). Labels are sanitised to `[a-z0-9-]`.
Done-when: the test, on a temp git repository, shows `create` leaves `git status --porcelain`, the index, `HEAD` and branches byte-identical; an untracked file is in the checkpoint's tree and an ignored file is not; the 11th create prunes the oldest; two creates in the same second get distinct refs; a non-git directory returns `null`; an unborn `HEAD` works.

### 2 The `checkpoint` command — [ ]
Class: implement · Needs: 1 · Check: `node --test compiler/test/checkpoint-cli.test.mjs`
Do: add `go-getter checkpoint create [--label <l>] | list | restore <ref-or-label> [--yes] | prune [--keep <n>]` in `compiler/src/commands/checkpoint.mjs`, registered in `compiler/bin/go-getter.mjs` and its usage text. `restore` without `--yes` prints the restore plan and the command it would run (`git restore --source=<ref> --worktree --staged -- .`) and exits 0 changing nothing; with `--yes` it runs it and lists the files created since the checkpoint, which it does not delete.
Done-when: the test shows `create` prints the ref, `list` shows it, `restore` without `--yes` changes no file, `restore --yes` brings back an edited and a deleted tracked file and leaves a newer untracked file in place and listed.

### 3 Hook trigger — [ ]
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/checkpoint-hook.test.mjs compiler/test/hook-fields.test.mjs`
Do: in `evaluatePreTool` (and so on every host that runs the hook), when the pack's `checkpoint.triggers` (read like the gate config in `compiler/src/gate.mjs`, `gateArgs`) include `gated-action` and a Bash command matches the full catalog of both classes whatever the host, call `createCheckpoint` best effort: errors are swallowed, it never changes the decision, and it runs at most once per command. `go-getter plan start` does the same when `plan-step` is in the triggers. Record one telemetry line per checkpoint with the trigger and the label class only, never the command text.
Done-when: the test shows, on a fixture project with the pack's config, a `git push` payload creates a ref on Claude Code and on Cursor payloads while the Claude Code decision stays allow and the Cursor one stays deny; `git status` creates none; a failing `git` (stubbed) still returns the unchanged decision; the telemetry line has no command text.

### 4 Pack and guardrail — [ ]
Class: implement · Needs: 2, 3 · Check: `npm run check:packs`
Do: add `src/packs/checkpointing/pack.json` (id `checkpointing`, family harness, `components: [9]`, `requires: [hitl]`). Questions, each with tradeoffs and exactly one recommended option: `triggers` (multi: `gated-action` recommended, `plan-step`), `creation` (`hook-and-instruction` recommended, `instruction-only`), `retention` (`keep-10` recommended, `keep-all`). Outputs: a decision per answer as in other packs, the guardrail `checkpoint-before-gated-action` ("A gated action is preceded by a checkpoint") with enforcement tier 2 `builtin:checkpoint-before-gated` (the hook) and tier 1 (the instruction), the procedure `docs/skills/restoring-a-checkpoint.md` (list, inspect, `restore`, then the per-host native route: `/rewind` for file-tool edits on Claude Code, `/restore` on Gemini CLI, the git ref elsewhere), and structured data under `go-getter:` the hook reads. Add the golden fixture and an eval case as in `docs/skills/adding-a-practice-pack.md`.
Done-when: `npm run check:packs` passes; the golden fixture shows the artifacts of the recommended path; `render-pack checkpointing --dry-run` lists the decision, guardrail and procedure.

### 5 Host tiers and coverage — [ ]
Class: implement · Needs: 3 · Check: `node --test compiler/test/capabilities.test.mjs compiler/test/coverage.test.mjs`
Do: set `tiers["9"]` in each `compiler/capabilities/<host>.json` to what is confirmed: 2 where the host has a blocking pre-tool hook that runs the checkpoint (and on Claude Code and Gemini CLI, which also have native checkpoints), 1 on Copilot until its hook payload is confirmed (see `docs/plans/archive/hitl-pack.md`). Update the note on component 9 in `go-getter coverage` output so it names the restore route per host. Record anything learned about a host in its integration-surface fact with a source; mark unconfirmed items **Not confirmed**.
Done-when: the tests show component 9 with the tier per host and the restore route; `go-getter coverage` lists it.

### 6 Adopt it in this repo — [ ]
Class: implement · Needs: 4, 5 · Check: `npm run check:self-adoption && npm run check:generated && npm test`
Do: render the pack here with the recommended answers (`go-getter render-pack checkpointing`, `accepted-by: sergemso`) so its decision, guardrail and procedure land in `docs/` with index rows; run `go-getter apply` then `npm run build`. Update any text that names the pack count, document the command in `INSTALLING.md`, and run `go-getter:lint`.
Done-when: `npm run check:self-adoption` reports 8 packs adopted; `go-getter coverage` lists component 9 with `checkpointing`; in this repo, running `git push` through a host hook creates a ref listed by `go-getter checkpoint list`; `go-getter apply --check` is clean.

---

## Open items (not part of these steps)

- **Ignored files** (build output, credential files) are not captured, by design: they may hold secrets and are rebuildable.
- **Restore does not delete** files created since a checkpoint; the human removes them, since deleting is irreversible.
- **Submodules and very large untracked files** are captured as git does by default; no size cap yet.
- **Wrapped commands** (`sh -c`, scripts that force-push) are matched on literal text only, as for the gates.
- **Per-edit checkpoints** for hosts without native ones are out of scope; revisit if a restore need appears.
