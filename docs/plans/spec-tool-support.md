# Spec-tool support — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`.

Written 2026-10-10 from an interview with the repo owner (`sergemso`) for backlog item L.2 of `docs/plans/v0.2-agent-core-hardening.md`. Decision: `docs/decisions/0075-spec-tools-are-detected-and-tolerated.md` (read it first; it fixes the scope). Facts: `docs/facts/0029-openspec-layout-and-workflow.md` (confirmed against OpenSpec 1.14.1 on 2026-10-10), `docs/decisions/0099-git-workflow-pack-covers-branches-commits-and-prs.md` (one change = one branch = one PR).

## What you are building (read first)

go-getter detects a spec tool (OpenSpec first) and tolerates it. It adds no pack, no adapter, no spec format, no validation, and wires none of the tool's commands into a pack's checks. A small tool table in the compiler (one row: OpenSpec) holds the tool id, its detection markers and the patterns of its change folders; every consumer reads the table, so a second tool is one row and a test.

- **Detection:** `openspec/` containing `config.yaml`, `specs/` or `changes/`. `go-getter detect` reports `specTool: openspec` and nothing more; no pack question is prefilled.
- **Change folders:** `openspec/changes/<id>/` (live) and `openspec/changes/archive/<YYYY-MM-DD>-<id>/`. `<id>` is lowercase kebab-case, hyphens only, a leading number allowed.
- **`go-getter refs` / `attribute`:** every change folder the diff touches is a must-have `Refs:` target (the folder path, e.g. `openspec/changes/add-dark-mode`; an archived one by its archive path). If the branch slug (the part after `type/`) equals an existing change id that the diff does not touch, list that change as nice-to-have. Matching is by path first; the branch slug is only a hint, and nothing fails.
- **`conform`:** accepts a change folder as a target selector (the commits and files that touch it) and checks that diff against decisions and guardrails exactly as today. The change's proposal and specs are not an extra rulebook.
- **Coexistence:** `apply` rewrites only what sits between its markers and the instruction-file cap counts the whole file, so another tool's block in `AGENTS.md` is left alone and counts toward the 150 lines. This already holds; add a test.

Working rules: `docs/skills/working-a-change.md` (branch `type/slug`, PR, squash merge); before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `neutral-source-has-no-host-specific-language` (skills and shared text name no host), `no-runtime-dependencies`, `token-economy`.

**Rules the design fixes (do not re-decide):** no new decision, pack, adapter, validation or prefill; path first, branch slug only a hint; `conform` gains a target selector and no new check; a tool is one table row.

---

### 1 Tool table and detection — [ ]
Class: implement · Needs: none · Check: `node --test compiler/test/spec-tools.test.mjs`
Do: add `compiler/src/spec-tools.mjs` exporting the table (OpenSpec row: id, detection markers, live and archived change-folder patterns) and `detectSpecTool(root)`, `changeOfPath(path)` (returns `{ tool, id, folder, archived }` or `null`) and `changesTouched(paths)`. Report `specTool` from `compiler/src/detect.mjs`.
Done-when: the test shows a fixture with `openspec/config.yaml` detected, one without `openspec/` not; `changeOfPath` resolves `openspec/changes/add-x/proposal.md`, `openspec/changes/add-x/specs/a/spec.md` and `openspec/changes/archive/2026-10-10-add-x/tasks.md` to the folder and id (the archived id without the date), and `openspec/specs/a/spec.md` to `null`; `go-getter detect` prints `specTool`.

### 2 Refs and attribute — [ ]
Class: implement · Needs: 1 · Check: `node --test compiler/test/refs.test.mjs`
Do: in `compiler/src/refs.mjs` add each touched change folder to the must-have group with the reason "change folder touched in this diff", and a branch-slug match to an existing change id to the nice-to-have group. Update `skills/attribute/SKILL.md` so a change folder is a valid `Refs:` target (repo-relative path), keeping the `Refs:` rule that no issue numbers replace the trailer; regenerate the plugin copy with `npm run build`.
Done-when: the test shows a diff touching `openspec/changes/add-x/tasks.md` lists the folder as must-have, an archived change by its archive path, a branch `feat/add-y` with an untouched existing `add-y` lists it as nice-to-have only, and a repository without the tool is unchanged.

### 3 Conform and coexistence — [ ]
Class: implement · Needs: 1 · Check: `node --test compiler/test/spec-tool-coexistence.test.mjs`
Do: update `skills/conform/SKILL.md` so a change folder (live or archived) resolves to the commits and files touching it, then is checked as today; no new checks. Add the coexistence test: a fixture `AGENTS.md` with another tool's block outside go-getter's markers keeps it byte-identical through `apply`, and `builtin:file-max-lines` counts it.
Done-when: the test shows the foreign block unchanged after two `apply` runs and the line count including it; `npm run check:generated` and `check:neutral` pass.

### 4 Docs and close — [ ]
Class: review · Needs: 2, 3 · Check: `npm run check:plans`
Do: add a short section on spec tools to README or INSTALLING.md (what is detected, what `Refs:` lists, what is not done), run `go-getter:lint`, mark L.2 done in the v0.2 plan's backlog and archive this plan.
Done-when: lint reports no new errors; this plan is fully `[x]` and archived.

---

## Open items (not part of these steps)

- The RENAMED delta header and the marker syntax of the managed block older OpenSpec versions wrote into `AGENTS.md` are not confirmed (fact 0029).
- A second spec tool, a spec-workflow pack and wiring `openspec validate` into the verification gate are each a new decision when a team asks (0075).
