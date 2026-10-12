# Foreign packs and helper budgets (L.9) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-12 from an interview with the repo owner (`sergemso`) for backlog item L.9 (`docs/plans/backlog.md`, issue #92). Decision: `docs/decisions/0140-foreign-packs-and-helpers-are-vendored-pinned-and-held-to-the-cores-budgets.md`; read it first, it fixes the design. It sits on `docs/decisions/0118-extension-architecture-core-and-edges.md` and `docs/decisions/0119-helper-contract-v0.md`.

## What you are building (read first)

Loading a pack from outside the repository, and making any source's answers cheap in tokens by the core's own rules. The helper protocol itself is **not** built here: it is backlog item L.18, due once the trust steps of this plan exist (0119).

- **Budgets** in the one function every work source passes through, so in-tree sources prove them first (steps 1 and 2).
- **Foreign packs**: first the content rule, limited to data and builtin checks that only restrict (step 4), then a manifest entry by git URL and digest, vendored and verified by `apply` (step 3), so unvalidated content is never written.
- **Author path**: the contract suite and a short guide for writing a pack or, later, a helper (step 5), then adoption (step 6).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `no-runtime-dependencies`, `owned-files-never-clobbered`, `generated-host-files-not-hand-edited`, `neutral-source-has-no-host-specific-language`, `telemetry-records-metadata-only`, `no-secrets-in-added-lines`. Code: `compiler/src/trackers/worksource.mjs` (`callSource`), `compiler/src/trackers/overlay.mjs` (cache), `compiler/test/support/worksource-contract.mjs`, `compiler/src/apply.mjs` (manifest), `compiler/src/packs.mjs`.

**Rules the design fixes (do not re-decide):** no fetch at run time and no npm; trust is the pull request plus a verified digest; a foreign pack has no `run`, script or hook; the core renders what an agent sees from typed fields; no helper process is built until a trigger holds.

---

### 1 Answer budgets in callSource — [ ]
Issue: #182
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/worksource-budgets.test.mjs`
Do: in `callSource`, cap text fields, the bytes of an answer and the items of `list`. A capped field is cut and counted; a `list` over its cap is `unavailable`, and `plan status` and `plan next` refuse to report on it. `list` returns the step summary `plan next` and `plan status` read (id, title, state, parallel, class, needs, issue, `doneWhen` capped), never bodies; detail comes from `get`; loosen `isStep` only as far as that summary needs. Every typed text field passes the secret and personal-data patterns and loses control characters (as `cleanTitle` does for titles). Cache a network source's reads for a time limit and clear them on a write through the core; a local source is not cached. Choose the initial limits from the measured size of the file, GitHub and Jira sources and record them in the contract comment.
Done-when: tests show an oversized field cut with the count, a `list` over its cap making `plan next` refuse, a `list` carrying no bodies, a secret and an email in a title masked, a cached read not reaching the source and cleared by a write, and `plan next` output unchanged for the three in-tree sources.

### 2 Contract suite carries the budgets — [ ]
Issue: #183
Class: implement · Effort: medium · Needs: 1 · Check: `node --test compiler/test/worksource.test.mjs compiler/test/tracker-github.test.mjs compiler/test/tracker-jira.test.mjs`
Do: extend `compiler/test/support/worksource-contract.mjs` so any source of the kind is also tested for the step 1 budgets, the dry-run form of writes (prints the request, sends nothing) and the cache behaviour (a repeated read within its limit does not reach a network source, and a write clears it); keep the suite importable by a source outside the tree.
Done-when: the three in-tree sources pass, and a test double that returns a body in `list`, exceeds a cap or sends on a dry run fails.

### 3 Manifest entry, digest and vendoring — [ ]
Issue: #184
Class: implement · Effort: high · Needs: 4 · Check: `node --test compiler/test/foreign-vendoring.test.mjs`
Do: add a manifest entry for a foreign pack (git URL, digest, pack-format range); `apply` fetches it with `https` or `ssh` only (refusing `ext::`, `file:` and other transports), without hooks or submodules, runs the step 4 content rule, then vendors it. The digest is a SHA-256 over the sorted paths and byte contents of the vendored files, recomputed on every `apply` and check, so it does not depend on line-ending settings of the machine. No network call outside `apply`, no npm. Capabilities belong to helpers (0119 item 4) and are checked when helpers exist, not here.
Done-when: tests show a pinned pack vendored, a changed byte refused on check, an unpinned entry refused, a refused transport, content that fails step 4 never written, and removal on update leaving a modified copy alone (`owned-files-never-clobbered`).

### 4 Foreign pack content rule — [ ]
Issue: #185
Class: implement · Effort: medium · Needs: none · Human: owner confirms the content rule of decision 0140 item 3 · Check: `node --test compiler/test/foreign-content.test.mjs`
Do: validate a foreign pack as data and builtin checks only: refuse a `run` command, a script, a hook or an output path outside the pack's allowed files (`..`, absolute paths, `.git`). A foreign guardrail may use only kinds that restrict (`deny-path`, `secret-scan`, tier-1 advisory text); `gate-command` arguments that free or grant a command are refused, and a foreign pack cannot disable or override another rule.
Done-when: tests show a data-only pack accepted and each of a `run` entry, a script, a hook, a path traversal and a loosening `gate-command` refused with a message naming the entry.

### 5 Author guide and trigger record — [ ] ‖
Issue: #186
Class: plan · Needs: 2 · Check: `npm run check:tags`
Do: write a short procedure under `docs/skills/` for writing a pack and, once a trigger holds, a helper (contract, budgets, how to run the suite, what the PR reviewer checks), and record the two triggers of 0140 and the first kind in a fact so a later session can tell whether one has happened.
Done-when: the procedure and the fact exist, are indexed and carry canonical tags.

### 6 Adopt, document and close — [ ]
Issue: #187
Class: implement · Effort: medium · Needs: 4, 5 · Check: `npm run check:self-adoption && npm run check:generated`
Do: describe foreign packs and the budgets in INSTALLING.md and the README, vendor one test pack in a fixture to dogfood the path, and record in the plan's result line what was friction.
Done-when: the checks pass and the plan's result line states what was found.
