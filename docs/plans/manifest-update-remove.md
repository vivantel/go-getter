# Manifest, update and remove — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Needs`, `Check`.

Written 2026-10-06 by a `go-getter:roadmap` interview with the repo owner (`sergemso`). Decisions: `docs/decisions/0089-apply-records-ownership-in-a-manifest.md`, `0090-update-and-remove-work-from-the-manifest.md`, `0091-decisions-activate-on-acceptance-or-adoption.md` (all draft until accepted or adopted, 0091). Fact: `docs/facts/0033-apply-keeps-no-record-of-what-it-wrote.md`. Guardrail (draft): `docs/guardrails/owned-files-never-clobbered.md`.

## What you are building (read first)

go-getter (`/home/ubuntu/projects/vivantel/go-getter`, GitHub `vivantel/go-getter`) configures a project's agent harness through host agents. `go-getter apply` (`compiler/src/apply.mjs`, command `compiler/src/commands/apply.mjs`) recomputes every output from the adopted `docs/` artifacts and the installed package and rewrites whole files; it keeps no record of what it wrote, so it cannot update across versions or be removed cleanly (fact 0033). You add: a committed manifest `.go-getter/manifest.json` (0089); a `go-getter update` command and `go-getter apply --remove` (0090); version-drift signals; and the guardrail test script `npm run test:update` (the guardrail's `run`). Working rules, as in the v0.2 plan: never push to `main`; each step is a short-lived `type/slug` branch → PR → squash merge in its own git worktree; Conventional Commit titles with `Refs:` trailers; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`; Node ESM, zero runtime dependencies (guardrail `no-runtime-dependencies`); after any change to packs or generated files run `npm run build` and `npm run check:generated`.

**Rules the design fixes (do not re-decide):**
- The manifest records a `schema` number, the go-getter version, each adopted pack and version, every owned whole file with a content hash, and for each shared file the owned keys or marked blocks with the value each replaced, including the git setting `core.hooksPath`. It is committed.
- An owned item that no longer matches the manifest is skipped, reported `modified`, and the command exits non-zero; `--force` overwrites or removes it.
- `update` refuses a manifest with a newer `schema`; a project with no manifest is bootstrapped by the first `update` (recompute outputs, record matches as owned, the rest as `modified`).
- `--remove` deletes the manifest last and leaves `docs/` and `.go-getter/state`.
- Changes not derivable from recorded answers are handled by a `renamed` map in the pack (old option id to new), not migration scripts.

---

### 1 Manifest writer — [ ]
Class: implement · Needs: none · Check: `node --test compiler/test/manifest.test.mjs`
Do: add `compiler/src/manifest.mjs` with `buildManifest(plan, previous)` and `readManifest(project)`. Extend `planApply` in `compiler/src/apply.mjs` so each output records whether it is a whole file (hash) or a key or block in a shared file (`.claude/settings.json` and the other host settings files, `AGENTS.md` between `<!-- go-getter:start -->` and `<!-- go-getter:end -->`, git config `core.hooksPath`), with the replaced value read from the project before the first write. `writeApply` writes `.go-getter/manifest.json` (stable key order, trailing newline) after the outputs. Tests in `compiler/test/manifest.test.mjs` use a fixture project.
Done-when: a fixture `apply` writes a manifest listing every output; a second `apply` leaves it byte-identical; replaced values are recorded for settings keys and `core.hooksPath`.

### 2 Apply from the diff — [ ]
Class: implement · Needs: 1 · Check: `npm run test:update`
Do: add `"test:update": "node --test \"compiler/test/update/**/*.test.mjs\""` to `package.json`. Make `diffApply`/`writeApply` compare the manifest with the target outputs: remove owned items that are no longer produced (whole files, keys restored to their recorded value, blocks deleted), skip `modified` items with the reason, exit non-zero when any is skipped, and honour `--force`. `staleAgentFiles` stays as a source of stale paths until the manifest covers them.
Done-when: tests show a file that stops being produced is deleted, a key that stops being written is restored to its old value, a hand-edited file, key and block are each skipped and reported, and `--force` overwrites or removes them; this is what guardrail `owned-files-never-clobbered` runs.

### 3 apply --remove — [ ]
Class: implement · Needs: 2 · Check: `npm run test:update`
Do: add `--remove` and `--dry-run` (apply has neither today; its flags are `--project`, `--hosts`, `--skills`, `--no-skills`, `--check`) to `compiler/src/commands/apply.mjs`: plan against an empty target, undo every item the manifest lists (including restoring `core.hooksPath`, or unsetting it if it was unset), delete `.go-getter/bin/` and the manifest last; never touch `docs/` or `.go-getter/state`; honour `modified` and `--force`; `--dry-run` prints the plan and writes nothing.
Done-when: a fixture adopted with `apply` and then `apply --remove` equals the original fixture except `docs/` and `.go-getter/state`; a modified item survives without `--force`.

### 4 Bootstrap a project that has no manifest — [ ]
Class: implement · Needs: 2 · Check: `npm run test:update`
Do: in `compiler/src/manifest.mjs` add `bootstrapManifest(project, plan)`: recompute the outputs, record each one whose current content matches as owned (value replaced unknown, recorded as `unknown`), and record the rest as `modified`.
Done-when: a fixture adopted with the pre-manifest `apply` yields a manifest with every output owned; an edited file is `modified`; a second bootstrap changes nothing.

### 5 Pack `renamed` map — [ ]
Class: implement · Needs: none · Check: `npm run check:packs`
Do: extend the pack schema (`compiler/src/schema.mjs`, decision 0022) with an optional `renamed` map on a question (old option id to new), read by `compiler/src/reconfigure.mjs` when it maps recorded answers to the pack's options; document it in `src/shared/artifact-model.md` or the pack docs where options are described; `npm run build`.
Done-when: a fixture pack with a renamed option re-renders an artifact adopted under the old id without a changed answer; `check:packs` passes.

### 6 go-getter update — [ ]
Class: implement · Effort: high · Needs: 2, 4, 5 · Check: `npm run test:update`
Do: add `compiler/src/commands/update.mjs` and add an `update` case to the `switch` in `compiler/bin/go-getter.mjs` (also add `update` to its usage line): read the manifest (bootstrap it if absent), refuse a newer `schema`, re-render each adopted pack through `planReconfigure` with the recorded answers (new questions take their default per decision 0085), diff the host outputs as in step 2, print one dry-run plan (docs re-rendered, files added, changed or removed, `modified` skipped) and apply only with `--yes` or on interactive confirmation; `--dry-run` never writes.
Done-when: a fixture adopted at an older pack version updates to the newer one in one run with a printed plan; a second `update` is a no-op; the dry run writes nothing.

### 7 Drift signals — [ ]
Class: implement · Needs: 1 · Check: `npm run test:update`
Do: add a session-start nudge script under `src/hooks/` and list it in `NUDGES` in `compiler/src/hook.mjs`: one line when the manifest version or an adopted pack is older than the installed package (`go-getter <installed> installed, project at <manifest>: run go-getter update`), nothing otherwise, within the nudge line budget; make `apply --check` report a version mismatch as a problem.
Done-when: tests show the nudge line for an older manifest, no line for a current one, and `apply --check` failing on the mismatch and passing after `update`.

### 8 Adopt here and document — [ ]
Class: implement · Needs: 3, 6, 7 · Check: `npm run check:self-adoption && npm run check:generated && npm test`
Do: run `go-getter update` in this repo so `.go-getter/manifest.json` is committed; update the `uninstall` skill source (`src/skills/uninstall/SKILL.md`; `npm run build` regenerates `skills/uninstall/`) to run `go-getter apply --remove --dry-run` first; add "Updating" and "Removing" sections to `INSTALLING.md`; set guardrail `owned-files-never-clobbered` and decisions 0089 and 0090 `active` (with `accepted-by`) in the PR that makes `apply` use the manifest, update the index files, `npm run build`.
Done-when: this repo has a committed manifest and `apply --check` is clean; `go-getter apply --remove --dry-run` lists only generated items; decisions 0089-0091 are `active` or the owner's decision to leave one draft is recorded.
