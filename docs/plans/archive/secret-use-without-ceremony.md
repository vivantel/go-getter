# Secret use without ceremony (L.13) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-11 from an interview with the repo owner (`sergemso`) for backlog item L.13 (`docs/plans/backlog.md`). Decision: `docs/decisions/0126-secret-use-is-approved-once-per-user-and-bound-to-code.md`; read it first, it fixes the design. It refines `docs/decisions/0072-restricted-paths-have-access-modes.md` and `docs/decisions/0107-secret-run-and-put-are-limited-to-approved-commands-and-sources.md`.

## What you are building (read first)

Using a secret file without seeing its values works with no setup in the common case, and keeps the property that the agent never sees the value.

- **Recognising go-getter** by what a call runs (project runner, `PATH`, the home directory, `npx`, `node <entry>`), not by how it is spelled; commands are tokenised, not scanned as text, so a path mentioned in a quoted string or a heredoc is not a use of it (steps 1, 2).
- **Approvals**: a per-user record outside git, per project, bound to the command plus a hash of the files it runs and their local imports, expiring only when the hash changes (steps 3, 4). First use is one host prompt, then remembered (steps 5a, 5). The committed `use-commands` answer remains the shared list.
- **The tracker write verbs** are gated by identity, so the pack no longer asks for command spellings (step 6).

Result 2026-10-11: all steps done and merged (issues #103 to #110). Dogfooded on this machine: the Jira live check ran through `secret run` with the project runner (no `PATH` symlink, no answer edit), asked once and was silent afterwards, and editing its script marked the approval stale. Two findings fixed on the way: a prompt can wait minutes, so a pending record lasts 30 minutes, and a `PATH` symlink had hidden tests that relied on it.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `restricted-paths-denied`, `no-runtime-dependencies`, `telemetry-records-metadata-only`, `owned-files-never-clobbered`, `no-secrets-in-added-lines`. This work touches restricted paths: tests use temporary directories and fake values, never a real credential, and a shell call in a session must not name a restricted path or a key-like word in its text (the pre-tool hook denies the whole call until step 2 is merged; write such text with a file tool). The user-level store is under the home directory: tests point it at a temporary one through an environment variable and never touch the real one.

**Rules the design fixes (do not re-decide):** approvals are personal, per project, outside git; the hash covers the command's files and their local imports and nothing else; no expiry by clock; one prompt on first use; a host that cannot prompt hands over; the shared committed list stays and is a union with personal approvals; a command is exempt only as one simple command (no pipeline, no substitution), quoted arguments allowed; the project-local install wins over a user-level one.

---

### 1 Recognise go-getter by what a call runs — [x]
Issue: #103
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/invocation.test.mjs compiler/test/hook-commands.test.mjs`
Do: add `compiler/src/invocation.mjs` with a shell tokenizer (quotes, escapes, heredocs, one simple command versus a pipeline, list or substitution) and `goGetterCall(words, project)`, which says whether a command is a go-getter call and which subcommand: first word `go-getter` on `PATH`, `.go-getter/bin/go-getter` (relative or absolute), a path under the home directory whose real path is a go-getter entry, `npx` of go-getter, or `node <entry>` where the entry belongs to a go-getter package. Replace the plain-word, bare-`go-getter` check of `secretSubcommand` in `compiler/src/hook.mjs` with it, so quoted arguments are accepted and every install location works.
Done-when: tests show each spelling recognised, a lookalike (`go-getter-x`, a script named go-getter outside any package) refused, `go-getter secret run --from <path> -- cmd "quoted arg"` exempt, a pipeline or `$(...)` not exempt, and the existing hook tests pass.

### 2 Match a restricted path by file operands, not text — [x]
Issue: #104
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/restricted-operands.test.mjs compiler/test/hook-fields.test.mjs`
Do: replace the text scan of `candidatePaths` in `compiler/src/hook.mjs` with the tokenizer: a restricted path counts only as an operand or redirect target of a command that runs, and a quoted string, a heredoc body, an `echo` argument or a commit message is only text. Keep every existing real case (a read, a redirect, a copy, an `rm`) denied. Add the cases that were falsely denied (a Python or shell heredoc containing a key-like attribute, a commit message naming a dotenv file, an `echo`).
Done-when: tests show the false-denial corpus allowed and every previously denied real access still denied.

### 3 Hash a command's files and their local imports — [x]
Issue: #105
Class: implement · Effort: high · Needs: none · Check: `node --test compiler/test/command-fileset.test.mjs`
Do: add `compiler/src/secrets/fileset.mjs`: from a command's words, the project files it runs (a script argument, an `npm run` script's command, a `sh` file), then the local files they import (static `import`, `require` and dynamic import of a literal for JavaScript; `source` and `.` for shell; best effort for other languages), inside the project, with a depth and size cap and a symlink-out refusal. `fileSetHash(command, project)` is a SHA-256 over the sorted relative paths and content hashes; a command with no resolvable file hashes its words only and is reported as such.
Done-when: tests show a change to the script, to a file it imports and to a transitive import each change the hash, an unrelated file does not, a missing file and a cycle are handled, and a file outside the project is not followed.

### 4 The per-user approval store and `go-getter approvals` — [x]
Issue: #106
Class: implement · Needs: 3 · Check: `node --test compiler/test/approvals.test.mjs`
Do: add `compiler/src/secrets/approvals.mjs`: a file under the user's state directory (`$XDG_STATE_HOME`, else `~/.local/state`, overridable by `GO_GETTER_HOME` for tests), keyed by the project's real path, written atomically with mode 0600, holding `{ command, path, hash, approvedAt, host }` and never a value. `approved(project, command, path)` is true only when the stored hash equals the current `fileSetHash`. Add `go-getter approvals list|add|revoke` (add takes the command and path; list shows what each covers and whether it is current or stale).
Done-when: tests show an approval current, then stale after a file in its set changes, an approval for another project or another path not matching, revoke removing it, the file mode 0600 and no value in it.

### 5a Which hosts can prompt from the pre-tool hook — [x]
Issue: #107
Class: explore · Needs: none · Check: `npm run check:guardrails`
Do: for each of the seven hosts, from vendor documentation, record in its integration-surface fact whether a pre-tool hook can ask the human to approve a call (not only allow or deny), the payload shape for it and whether a later run of the same call needs another prompt. Mark what the documentation does not settle as not confirmed, with source and date.
Done-when: each host's fact states whether the hook can ask and how; Claude Code's answer is confirmed or the step says why not.

### 5 `secret run` and `put` use approvals, with a first-use prompt — [x]
Issue: #108
Class: implement · Effort: high · Needs: 1, 2, 4, 5a · Check: `node --test compiler/test/secret-approval.test.mjs compiler/test/secret-run.test.mjs compiler/test/secret-put.test.mjs`
Do: a command may use a secret path when the committed `use-commands` entry names it or `approved()` is true. For an unapproved command, on a host whose hook can ask, the pre-tool hook asks the human naming the command, the secret path and the files hashed, and records a short-lived pending approval; `secret run` promotes a matching pending record to an approval when it runs and refuses when there is none (so a call from inside another script, which no hook saw, cannot approve itself). On a host that cannot ask, the hook denies with the `go-getter approvals add` line to hand over. An agent must not be able to forge an approval: the hook refuses an agent's call to `go-getter approvals add` or `revoke` and any tool call that writes the approvals store (a person runs those), and a pending record is accepted only if the hook wrote it. The `use` mode no longer needs the path listed in `restricted-modes` for a prompted approval; `sink` and `put` follow the same rule.
Done-when: tests show an agent's call to `approvals add` or a write to the store denied by the hook, a first use prompting once and recording, a second silent run, a changed script asking again, a call from inside a script refused, the shared-list command running with no prompt, a host without ask handing over, and output still scrubbed.

### 6 Gate the tracker write verbs by identity — [x]
Issue: #109
Class: implement · Needs: 1 · Check: `npm run check:packs && npm run check:self-adoption && npm run check:generated && npm test`
Do: `apply` generates the ask rules for `plan issue create|comment|close` for every recognised spelling of go-getter in the project (the project runner, `go-getter`, `npx`, `node <entry>` as present), so the tracker pack's `write-commands` question is removed (pack 0.3.0, the answer file stays readable) and the hook gates by identity on hosts without native rules. Adopt it here.
Done-when: tests show the rules for each spelling present, a lookalike not gated, an old answer file rendering without error, and `apply --check` clean here.

### 7 Secret use: dogfood, docs and close — [x]
Issue: #110
Class: review · Needs: 2, 5, 6 · Check: `npm run check:plans && npm run check:guardrails`
Do: with no symlink and no answer edit, run the Jira live check through `secret run` (first use prompts once, the second run is silent, an edit to the script asks again); describe approvals, the shared list, recognised installs and operand matching in INSTALLING.md and the README; note in 0072 and 0107 that 0126 refines them; run the full `go-getter:lint` skill; mark L.13 done in `docs/plans/backlog.md` and archive this plan.
Done-when: the live check passes through the prompt-once flow on this machine; lint reports no errors; the plan moves to `docs/plans/archive/`.
