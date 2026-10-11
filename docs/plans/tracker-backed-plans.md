# Tracker-backed plans (L.7) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-11 from an interview with the repo owner (`sergemso`) for backlog item L.7 of `docs/plans/v0.2-agent-core-hardening.md`. Decisions: `docs/decisions/0117-tracker-backed-plans.md` (what is built) and `docs/decisions/0118-extension-architecture-core-and-edges.md` (the WorkSource interface and the in-process-first rule); read both first, they fix the design.

## What you are building (read first)

An optional `tracker` pack that lets a project keep plan steps in GitHub Issues or Jira, and moves this repository's own plan there. Priority: ship the GitHub path as soon as it works end to end (steps 1, 2, 3, 5, 6, 7 and 8, which do not wait for Jira); Jira rides the same interface and lands in steps 4, 6j and 7j with its own contract run.

- `compiler/src/plan.mjs` reads steps through a WorkSource (`list`, `get`, `create`, `setState`, `comment`). The file source is today's behavior. The GitHub source (through `gh`) and the Jira source (Node `fetch`, no dependency) are modules under `compiler/src/trackers/`. Nothing outside those modules names `gh` or Jira.
- A step may carry `Issue: <reference>`. For a step with an issue the issue's state decides what `plan status|next` show; a mismatch with the file marker is reported and neither is changed. Offline, the last state read (a cache in the project's state directory) is shown and labelled stale.
- Writes (create, comment, close) are `go-getter plan issue ...` verbs only, under the pack answer `off`, `ask` (default) or `allow`. Raw `gh issue *` and `gh api` stay gated by `gated-actions-need-human-approval`.
- No hierarchy sync: a plan is still a file of steps; an epic is not read.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `no-runtime-dependencies`, `gated-actions-need-human-approval`, `telemetry-records-metadata-only`, `no-secrets-in-public-repo`, `pack-questions-have-a-recommended-default`, `practice-ships-only-after-self-adoption`. This repository is public: an issue created from a plan carries only text that is already in the public repository. Tests use a stub `gh` on `PATH` and a local HTTP server for Jira; no test calls a real service. A shell call in a session must not name the restricted state directory in its text.

**Rules the design fixes (do not re-decide):** one tracker per project, which need not be the git host; a Jira status maps by status category; closing a Jira issue takes the single transition into the done category, else refuses and lists them; credentials come from environment variables named in the pack answers and are never written, printed or recorded; writes go through go-getter verbs and never through a helper's own initiative; a step created from the tracker takes its number or key as id, an existing step keeps its id and gains `Issue:`.

---

### 1 WorkSource interface and the file source — [x]
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/plan.test.mjs compiler/test/worksource.test.mjs`
Do: define the WorkSource contract in `compiler/src/trackers/worksource.mjs` and put `plan status|next` behind a file source implementing it (`plan start|done` still edit the file directly and move behind the source in step 3), with no change to any command's output. Add a contract test that runs any source against the same cases (list order, get by id, create, set state, comment, an unknown id) and run it on the file source.
The interface obeys decision 0119: arguments and results are plain data, with no callbacks and no shared state, and the contract test checks that a call's input and output survive a JSON round trip. Tracker text never becomes a command: `Check:` stays in the plan file.
Done-when: the existing plan tests pass unchanged; the contract test passes for the file source and shows every call's input and output unchanged by a JSON round trip; `check:plans` is clean on every plan in `docs/plans/`.

### 2 Issue references and the `Issue:` field — [x]
Class: implement · Needs: 1 · Check: `node --test compiler/test/tracker-refs.test.mjs compiler/test/plan.test.mjs`
Do: add a reference parser per tracker (`parseRef`): GitHub `#123`, `owner/repo#123`, an issue URL; Jira `PROJ-123` and a browse URL; each returns `{ tracker, key }` or null, and `PROJ-123` is not read as GitHub. Allow a hyphen between alphanumeric groups in a step id (`ID` in `plan.mjs`). Add `Issue` to the plan step fields and make `check plans` report a malformed or duplicate reference.
Done-when: the tests show each form parsed and each near miss (`PROJ123`, `#`, `repo#1.2`) rejected, a plan with `Issue: PROJ-12` on a step parsing, and `check plans` failing on a malformed reference with the file and line.

### 3 GitHub source and `plan` reading issue state — [x]
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/tracker-github.test.mjs`
Do: add `compiler/src/trackers/github.mjs` implementing `list` and `get` through `gh issue view --json` (state, state reason, title, number) with the repository from `origin`, a state cache with a fetched-at time, and a stale label when `gh` fails. `plan status|next` show an issue's state for a step with `Issue:` and print a mismatch line when it differs from the file marker. `plan start` and `plan done` go through the source: `start` checks a step's Needs against source state (the issue's for a step with `Issue:`, the file marker otherwise); `done` runs the step's Check and sets the file marker but does not close the issue, which stays a gated write (`plan issue close`, step 6), so a done step with an open issue is reported as a mismatch until it is closed. Tests put a stub `gh` first on `PATH`.
Done-when: the contract test passes for the GitHub source; with a stub returning a closed issue `plan status` shows the step done and reports the file marker as a mismatch; with the stub failing it shows the cached state marked stale; a step without `Issue:` is unchanged; `plan start` refuses a step whose Needs include a step with a still-open issue even when the file marks it done.

### 4 Jira source — [ ] ‖
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/tracker-jira.test.mjs compiler/test/secret-patterns.test.mjs`
Do: add `compiler/src/trackers/jira.mjs` for `list` and `get` over the REST API with Node's `fetch`, Basic authorization from the environment variables named in its configuration (default `JIRA_EMAIL`, `JIRA_API_TOKEN`), state by status category, the same cache and stale rule as step 3. Add an Atlassian token kind to `compiler/src/secrets/patterns.mjs` so redaction and scanning cover it. A missing variable fails naming the variable, never a value. Tests run a local HTTP server.
Done-when: the contract test passes for the Jira source against the local server; a status named anything maps by category; a missing variable names it and leaks nothing; a fake Atlassian token in output is redacted and in an added line is flagged by `secret-scan`.

### 5 Issues as `Refs:` targets — [ ] ‖
Class: implement · Needs: 2 · Check: `node --test compiler/test/refs.test.mjs compiler/test/commit-trailer.test.mjs`
Do: `go-getter refs`, the attribute skill and the conform skill list a step's issue, and an issue the branch slug names (`feat/123-title`, `feat/PROJ-123-title`), as a `Refs:` target; the commit-trailer check accepts `#123` and `PROJ-123` as trailer values. Nothing is fetched.
Done-when: the tests show a branch `feat/PROJ-123-title` listing `PROJ-123` as nice-to-have, a touched plan step with `Issue:` listing it as must-have, and a `Refs: #123` trailer passing the trailer check.

### 6 Write verbs for GitHub: `plan issue create|comment|close` — [x]
Class: implement · Effort: high · Needs: 3 · Check: `node --test compiler/test/tracker-write.test.mjs`
Do: add the verbs on the GitHub source. Each takes `--dry-run` (prints the request without sending), refuses when the answer is `off`, records only the verb and `pass|fail|blocked` in telemetry, never the issue text, and takes the issue body only from the plan step's text. `create` writes `Issue:` onto the step. A comment and a body pass through the secret patterns first and are refused if a finding exists.
Done-when: the tests show a dry run sending nothing, `off` refusing, a body containing a fake token refused, a GitHub create calling the stub once and writing `Issue:`, a close making `plan status` show the step done with no mismatch, and telemetry holding no issue text.

### 6j Write verbs for Jira — [ ] ‖
Class: implement · Needs: 4, 6 · Check: `node --test compiler/test/tracker-write.test.mjs compiler/test/tracker-jira.test.mjs`
Do: add `create`, `comment` and `close` to the Jira source under the same rules as step 6. `close` takes the single transition into the done category; with none or several it refuses and lists them, unless the configuration names one.
Done-when: the tests show a Jira create and comment against the local server, a close with one done transition succeeding and a close with two refusing and listing both.

### 7 The tracker pack and its gating — [x]
Class: implement · Effort: high · Needs: 6 · Check: `npm run check:packs && npm run check:self-adoption && npm run check:generated && npm test`
Do: add `src/packs/tracker/pack.json` (SDLC family): `tracker` (choice `files` recommended, `github`; `jira` is added in step 7j), `writes` (`off`, `ask` recommended, `allow`) and `write-commands` (the command prefixes the `ask` gate covers, one per spelling of the three verbs, since a prompt matches command text; `plan issue --dry-run <verb>` is never matched). Outputs: a decision per answer and the guardrail `tracker-writes-follow-the-answer` with a tier 2 `builtin:gate-command` entry that gates `go-getter plan issue *` when the answer is `ask`, and a tier 1 instruction. `go-getter coverage` names the tracker and the write mode. Adopt it here with `github` and `ask` through `go-getter update`/`reconfigure`, then `apply` and `npm run build`; a step without `Issue:` stays file-driven, so adoption changes nothing until step 8.
Done-when: `check:packs` passes; `check:self-adoption` reports the tracker pack adopted; with `ask` the generated host rules prompt for `go-getter plan issue create` and not for reads; with `off` the verb refuses; `apply --check` is clean; an answer file without the pack renders nothing new.

### 7j Jira in the pack — [ ]
Class: implement · Needs: 4, 6j, 7 · Check: `npm run check:packs && npm run check:self-adoption && npm run check:generated && npm test`
Do: bump the pack and add the `jira` choice with its answers (site, project key, the names of the two credential variables, an optional done transition; each `since` the new version, with a default), their decisions, and the coverage line. An answer file from before it renders unchanged. Adopt the new version here with the `github` answer unchanged.
Done-when: `check:packs` and `check:self-adoption` pass; a project answering `jira` renders the decisions and the guardrail with the Jira names; `apply --check` is clean here.

### 8 Move this repository's plan to GitHub Issues — [ ]
Class: implement · Needs: 7 · Check: `go-getter plan status`
**Creating issues is outward-facing: needs the owner's go-ahead, after reading the dry run.**
Do: run `go-getter plan issue create --dry-run` for every pending step of the plans in `docs/plans/` and the open backlog items (L.6, L.8, L.9) and show it to the owner; check no text carries non-public information. On approval create the issues, which writes `Issue:` onto each step, and change the "Remaining work" paragraph of `AGENTS.md` (outside the generated block) to say that open work is the repository's issues and the plan files hold the step text. A step already done stays in the file only.
Done-when: `go-getter plan next` names a pending step from its issue; every pending step has `Issue:`; closing one issue with `go-getter plan issue close` makes `plan status` show it done; `go-getter:lint` finds no stale pointer to the old workflow.

### 9 Docs, lint and close — [ ]
Class: review · Needs: 7j, 8 · Check: `npm run check:plans && npm run check:guardrails`
Do: describe the tracker pack in README and INSTALLING.md (what is read, what is written, how credentials are supplied, the stale label, that hierarchy is not synced), run the full `go-getter:lint` skill, mark L.7 done in the v0.2 plan backlog and archive this plan.
Done-when: lint reports no errors; the plan moves to `docs/plans/archive/`; L.7 reads done.
