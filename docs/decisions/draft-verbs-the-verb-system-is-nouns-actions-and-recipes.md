---
id: draft-verbs-the-verb-system-is-nouns-actions-and-recipes
title: The verb system is a closed set of nouns, atomic noun-action verbs, and recipes that compose them
status: draft
date: 2026-11-08
tags: [architecture, compiler, enforcement]
track: product
---

## Decision

The review of 2026-11-08 counted 40 public verbs and about 110 verb-argument forms, with overlapping pairs (`route`/`routing`, `pack`/`packs`, `ship`/`pr`, `metrics`/`telemetry`/`digest`), one-line help, and `work` carrying 17 forms. This decision replaces the flat list with three layers. It is a draft until the owner accepts it; accepting it supersedes nothing by itself (0157 and 0163 keep their meaning of `ship` and `pr`; they become recipes).

### 1. The closed set: what go-getter covers

go-getter covers exactly the functionality that belongs to a **part** of the framework (0177) or to the **plumbing** that serves it. Everything else is out of scope. The set is closed in the sense that a new capability enters only through the admission rule in item 6.

| Plane | Noun (owns one artifact kind) | What it owns |
|---|---|---|
| Configure | `host` | generated host-agent files, their drift, removal and update |
| | `pack` | the packs, their interview, rendering and reconfiguration |
| | `kb` | the knowledge base in `docs/`: indexes, ids, checks, references |
| Decompose / Deliver | `plan` | plan files and their steps: status, order, start, done, drafting, approval, tracker issues |
| | `unit` | one work unit's lifecycle: pick, claim, heartbeat, release, accept, scope |
| | `ask` | a parked question and its answer |
| | `grant` | the authority a worker holds: issue, spend, check |
| | `run` | an autonomous run over a plan range |
| | `queue` | the merge queue |
| | `tree` | git worktrees of tasks |
| | `snapshot` | checkpoints (hidden git refs) |
| | `change` | a change on its way to the default branch: commit, push, open, merge |
| | `ci` | CI status and waiting |
| | `release` | version, changelog, release pull request |
| Govern | `gate` | the runtime rules: verification classes, routing, calibration |
| | `approval` | human approvals and the secret-use store |
| | `secret` | use and fill of restricted paths without the model seeing them |
| Measure / Operate | `meter` | meters, readings, series, expiry; operation status |
| | `report` | telemetry summary, day metrics, digest, sampled audit, coverage |
| Plumbing | `serve` | the MCP server |
| Maintain go-getter | `dev` | build and eval of this repository (not shown to users) |

20 nouns. A noun owns one artifact kind and one kind of decision (the rule 0177 applies to the five parts), so two nouns never write the same file.

### 2. Atoms: the MECE verb list

An **atom** is a verb that (a) changes the state of exactly one noun in one way, (b) uses no model, (c) is deterministic for the same inputs, (d) declares one effect class (`read`, `local-write`, `outward`, `irreversible`) in the table, and (e) cannot be written as a sequence of other atoms. Spelling is `go-getter <noun> <action>`; the action comes from a fixed vocabulary:

`list` `show` `check` `create` `update` `remove` `start` `finish` `claim` `release` `approve` `answer` `read` `define` `expire` `restore` `prune` `render` `apply` `diff` `merge` `push` `open` `commit` `wait` `next` `status`

MECE is checked by a test, not by reading: the command table lists every atom as one row `(noun, action, effect, one-line summary, json-schema)`; the test fails if two rows share `(noun, action)`, if an action is outside the vocabulary, if a handler under `commands/` has no row, if a row has no handler, if a summary is empty or over 80 characters, or if two atoms write the same path pattern (declared in the row).

Atoms by noun (old form in brackets; every old form stays as a deprecated alias, item 5):

- `host`: `apply` [`apply`], `diff` [`apply --check`], `remove` [`apply --remove`], `update` [`update`], `show` [`coverage`], `check` [`doctor`], `detect` [`detect`], `sandbox` [`sandbox`].
- `pack`: `list` [`packs`], `show` [`pack <id>`], `next` [`interview next`], `check` [`interview validate`], `render` [`render-pack`], `update` [`reconfigure`].
- `kb`: `check` [`check <name>`], `update` [`artifacts index`], `create` [`artifacts assign`], `show` [`refs`].
- `plan`: `status`, `next`, `start`, `finish` [`plan done`], `create` [`plan draft`], `approve`, `open` [`plan issue`].
- `unit`: `next` [`work next`], `claim`, `release`, `update` [`work heartbeat`], `approve` [`work approve`], `finish` [`work accept`], `check` [`work accept-check`, `scope-check`], `open` [`work request`], `create` [`work escape`].
- `ask`: `create` [`work park`], `list` [`work asks`], `answer`.
- `grant`: `create` [`work grant`], `update` [`work spend`], `check` [`work grant-check`].
- `run`: `start`, `status`, `next`, `update` [`run attempt`], `finish` [`run end`].
- `queue`: `create` [`queue enqueue`], `start` [`queue run`], `status`.
- `tree`: `create` [`worktree new`], `list`, `prune` [`worktree clean`].
- `snapshot`: `create`, `list`, `restore`, `prune`.
- `change`: `check` (branch name, clean tree, guardrail checks), `commit`, `push`, `open` (pull request), `merge`.
- `ci`: `status`, `wait` [`ci status --wait`, `watch`].
- `release`: `show` (version bump and changelog plan), `create` (the release pull request), `merge`.
- `gate`: `check` [`verify`], `show` [`route`], `update` [`routing calibrate`]. The `hook` entry point stays internal.
- `approval`: `list`, `create` [`approvals add|allow`], `release`, `remove` [`approvals revoke`].
- `secret`: `start` [`secret run`], `create` [`secret put`].
- `meter`: `define`, `read`, `list` [`measure series`, `due`], `expire`, `show` [`operation status`], `check` [`outcome check`, `operation check`].
- `report`: `show` [`telemetry summary`, `metrics day`, `digest`, `coverage`], `create` [`audit pick`], `update` [`audit fail`].
- `serve`: `start` [`mcp serve`].
- `dev`: `render` [`build`], `check` [`eval`, `eval bypass`].

### 3. Recipes: ordered atom sequences with a durable expected result

A **recipe** is a named, ordered list of atoms that, executed in that order, yields one result a person expects without reading the steps. Recipes live in one file (`compiler/recipes.json`), never in handler code, so the expansion can be printed and tested. A recipe is **admitted** only when all of these hold:

1. **Intent.** One imperative name (`ship`, `start`) that says what is true afterwards. Postcondition written in one sentence ("the change is merged and its worktree is gone").
2. **Evidence.** The same sequence was run by hand at least three times in the telemetry log or the transcripts of a dated window, or the owner names it. Counts are read by `go-getter report show --sequences`, not estimated.
3. **Order is stated with a precondition and a postcondition per atom**, so a failure names the atom and the one command that resumes.
4. **Idempotent or resumable.** Running it again after a stop continues, never repeats an outward effect (a push or merge already done is detected).
5. **Effect class is the maximum of its atoms**, and its gate is the union: a human approves the recipe once per run (0130), not each atom.
6. **No flag changes what it means.** A different result is a different recipe (0163: `ship` always merges, `pr` stops). Flags may change reporting or dry-run only.
7. **`--plan` prints the expansion** (atoms in order, effect class, gate) and writes nothing.
8. **Tests, red first:** an expansion test (the file lists only existing atoms), a stop test per atom (a forced failure at atom *n* leaves atoms 1..*n*-1 done, nothing after, and prints the resume command), and a rerun test (no duplicated outward effect).
9. **Token budget.** The recipe's default output is at most 12 lines; detail goes to `--json` or a log path.
10. **Removal** is by superseding decision, never by editing the file silently.

### 4. The recipes (the verbs a person types)

| Recipe | Expands to | Result |
|---|---|---|
| `setup` | `host detect` → `pack next` (per pack, defaults) → `pack render` → `host apply` → `host check` | the project is configured and healthy |
| `status` | `plan status` → `unit next --dry-run` → `ask list` → `run status` → `ci status` → `host check` | one screen: what is next, what waits, what is red |
| `start` | `plan next` → `tree create` → `unit claim` → `snapshot create` | a claimed step in its own worktree |
| `pr` | `change check` → `snapshot create` → `change commit` → `change push` → `change open` → `ci wait` | a reviewed-ready pull request with CI read |
| `ship` | `pr` → `change merge` → `tree prune` → `unit finish` | the change is merged and its unit done |
| `finish` | `unit check` → `unit finish` → `plan finish` → `tree prune` | the unit is accepted and cleaned up |
| `release` | `release show` → `release create` → `ci wait` → `release merge` | one release pull request merged (never tags or publishes, 0094) |
| `undo` | `snapshot list` → `snapshot restore` | the tree is back at a chosen snapshot |
| `health` | `host check` → `kb check` (all) → `meter check` → `host show` | everything that can be red, in one read |
| `adopt <pack>` | `pack next` → `pack render` → `host apply` | one pack adopted |
| `sync` | `host update` → `host diff` | host files match the installed version |

Candidates not admitted yet (no evidence): `resume`, `triage`, `handoff`.

### 5. Migration and discoverability

- Every old name remains for two minor versions as a deprecated alias that prints the new spelling on stderr and works; `raw-commands-redirect-to-verbs` and the hook gate catalog are updated to the new names in the same change, and `doctor` prints the allow-rules for the recipes.
- `go-getter help` prints the recipes with one line each; `go-getter help <noun>` prints that noun's atoms; `go-getter explain <name>` prints a recipe's expansion. Each help screen is at most 30 lines (a test counts them).
- Exit codes are fixed across all atoms: 0 ok, 1 failed, 2 usage, 3 needs a human (gated), 4 stale or conflicting state. Every atom has `--json`; the default output is compact.

### 6. Admission rule for new functionality (the set stays closed)

New functionality is accepted only if its decision (a) names the noun it extends or proposes one, with the artifact kind it owns and a row in the table above proving no existing noun owns it; (b) lists its atoms with effect classes; (c) states the recipe it joins, if any, with the evidence of item 3.2; (d) adds a red test before the code; (e) stays inside the budgets: at most 24 nouns, at most 8 atoms per noun, at most 12 recipes. Exceeding a budget needs a superseding decision that says what is merged or removed.

## Owner's answers (2026-11-08)

Accepted in layers: the command table, descriptions and fixed usage first; noun-action spellings with deprecated aliases second; recipes third, each admitted by owner mark or three telemetry occurrences. The first screen of `go-getter help` lists at most 12 recipes plus `help`. Hooks are POSIX only. `accepted-by` is set when the owner signs the file.

## Why

A verb a person types should say what is true afterwards; an atom should say which one thing it changes. Today one name (`work`) hides 17 forms and several names mean nearly the same thing, so a new user cannot predict the verb, a hook cannot name it without a special case, and an agent spends tokens reading long usage text. Splitting atoms from recipes keeps the gates exact (an approval is a property of the atom's effect class) while the surface a person learns shrinks to about a dozen words. Evidence-based admission stops recipes from becoming a second flat list.

## Tradeoffs considered

- **Keep the flat list and add descriptions:** cheapest, but leaves the overlaps and the 17-form `work`; rejected as the end state, kept as the first step (descriptions and usage fixes land first, plan step H10).
- **Only nouns, no recipes:** MECE but forces five commands where `ship` is one; rejected.
- **Recipes as shell scripts:** hides the expansion from tests and gates; rejected for a data file.
- **Break old names at once:** simplest code, but the generated host files and the plugin copy in other repositories call the old names; rejected for two minor versions of deprecated aliases.
