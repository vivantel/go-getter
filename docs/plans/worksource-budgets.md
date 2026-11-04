# Work-source budgets — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/archive/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Split out of the former single `roadmap.md` on 2026-11-03 (decision 0165, plan `work-coordination.md`). Step text, ids and issue numbers are unchanged. The product-level index is `docs/plans/roadmap.md`. `Needs` lists ids in this plan only; a dependency on another plan is written in the step's Context until `work-coordination.md` step K1 makes `plan#id` parse. Live state of a step follows decision 0166 once K2 lands; until then update the marker and `Progress` line in place as before.

## Phase 4 — Work-source budgets

Decision `docs/decisions/0140-foreign-packs-and-helpers-are-vendored-pinned-and-held-to-the-cores-budgets.md` fixes the design; read it first (with 0118 and 0119). Budgets go in the one function every work source passes through, so in-tree sources prove them first. Code: `compiler/src/trackers/worksource.mjs` (`callSource`), `compiler/src/trackers/overlay.mjs` (cache), `compiler/test/support/worksource-contract.mjs`.

### W1 Answer budgets in callSource — [x]
Issue: #182
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/worksource-budgets.test.mjs`
Do: in `callSource`, cap text fields, the bytes of an answer and the items of `list`. A capped field is cut and counted; a `list` over its cap is `unavailable`, and `plan status` and `plan next` refuse to report on it. `list` returns the step summary `plan next` and `plan status` read (id, title, state, parallel, class, needs, issue, `doneWhen` capped), never bodies; detail comes from `get`; loosen `isStep` only as far as that summary needs. Every typed text field passes the secret and personal-data patterns and loses control characters (as `cleanTitle` does for titles). Cache a network source's reads for a time limit and clear them on a write through the core; a local source is not cached. Choose the initial limits from the measured size of the file, GitHub and Jira sources and record them in the contract comment.
Done-when: tests show an oversized field cut with the count, a `list` over its cap making `plan next` refuse, a `list` carrying no bodies, a secret and an email in a title masked, a cached read not reaching the source and cleared by a write, and `plan next` output unchanged for the three in-tree sources.

### W2 Contract suite carries the budgets — [ ]
Issue: #183
Class: implement · Effort: medium · Needs: W1 · Check: `node --test compiler/test/worksource.test.mjs compiler/test/tracker-github.test.mjs compiler/test/tracker-jira.test.mjs`
Do: extend `compiler/test/support/worksource-contract.mjs` so any source of the kind is also tested for the W1 budgets, the dry-run form of writes (prints the request, sends nothing) and the cache behaviour (a repeated read within its limit does not reach a network source, and a write clears it); keep the suite importable by a source outside the tree.
Done-when: the three in-tree sources pass, and a test double that returns a body in `list`, exceeds a cap or sends on a dry run fails.
