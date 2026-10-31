# Host permission rules (print, never write) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`.

Written 2026-10-31. Decision: `docs/decisions/0152-apply-and-doctor-print-allow-rules-for-commands-a-host-classifier-may-refuse.md` (draft until the owner accepts it, decision 0091); read it first, it fixes the design. It sits on `docs/decisions/0094-gated-actions-need-human-approval.md`, `docs/decisions/0120-gated-commands-may-be-freed-by-name.md` and `docs/decisions/0127-gated-free-commands.md`.

**Rules the design fixes (do not re-decide):** go-getter prints allow rules and never writes them; an agent never writes `.claude/settings.local.json`; the rules come from the catalog and the plan-issue verbs, not a second list.

---

### 1 Print the allow rules for freed and approved commands — [~]
Class: implement · Effort: medium · Needs: none · Human: accept decision 0152; no issue yet, create it with `go-getter plan issue create` once the owner has added the allow rule to their `.claude/settings.local.json` · Check: `node --test compiler/test/allow-rules.test.mjs`
Do: add `go-getter doctor` and the same output to the `apply` report, `permissions.userAllow` in the capability schema and `claude-code.json`, the INSTALLING.md section, and tests (answer combinations, nothing freed, no file written, no wildcard wider than the command).
Done-when: `doctor` and `apply` print the matching rules for a project that frees `pr-merge` or enables tracker writes and nothing otherwise, the project tree is unchanged by both, the checks pass, and a pull request is open.
