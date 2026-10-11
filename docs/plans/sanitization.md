# Sanitization slices S2-S4 — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Check`.

Written 2026-10-10 from an interview with the repo owner (`sergemso`) for backlog item L.4 of `docs/plans/v0.2-agent-core-hardening.md`. Decisions: `docs/decisions/0106-scanning-and-masking-share-one-pattern-library.md` (S2, S3) and `docs/decisions/0107-secret-run-and-put-are-limited-to-approved-commands-and-sources.md` (S4); read both first, they fix the design. They refine `docs/decisions/0072-restricted-paths-have-access-modes.md`, whose first slice (S1: access modes recorded, hook fix, value-based output redaction) is done. Facts: 0027 (Claude Code secret levers), 0030 and 0031 (output redaction and read deny levers per host).

## What you are building (read first)

Three slices in the `governance` pack (component 7, now at 0.2.0); each bumps the pack version, adds questions with `since` and a default, and is adopted in this repo before it ships (`practice-ships-only-after-self-adoption`).

- **S2 scanning (steps 1-4, pack 0.3.0).** A shared pattern library (`compiler/src/secrets/patterns.mjs`) holding the built-ins that `compiler/src/hook.mjs` redaction already uses (`KEY_BLOCK` and the `BUILTIN` token regexes), plus JWTs and labelled assignments. A tier-3 builtin `secret-scan` reads the lines added by the staged diff, the commits being pushed and the pull request, skips a line with `go-getter:allow-secret` and the paths of the `scan-allow-paths` answer, and reports file, line and kind, never the value. Today `.githooks/pre-push` is the only git hook and `check --stage` is reserved (every stage runs every tier-3 check), so this slice adds stage-aware checks and a pre-commit hook.
- **S3 masking (steps 5-8, pack 0.4.0).** PII detectors (email; Luhn card numbers; mod-97 IBANs; opt-in phone and national-ID lists) and per-session pseudonyms (`[email-1]`) in tier-2 tool-output redaction, with a map of `{salt, hash(value) -> n}` in the restricted state directory, cleaned at session end or after 24 hours. Secrets keep the single marker `REDACTED`. Hosts that cannot replace output (Cursor, OpenCode) are reported as such.
- **S4 `secret run|put` and `sandbox` (steps 9-12, pack 0.5.0).** `secret run` (env entries and temp files, only approved commands, scrubbed output), `secret put` (stdin or a declared command, 0600, nothing echoed), the activation of `use` and `sink` in the pre-tool hook (the exemption for exactly these two subcommands already exists: `secretSubcommand` in `compiler/src/hook.mjs`), and `go-getter sandbox`.

Working rules: `docs/skills/working-a-change.md` (branch `type/slug`, PR, squash merge, one worktree per parallel task); before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `restricted-paths-denied`, `no-runtime-dependencies`, `telemetry-records-metadata-only`, `owned-files-never-clobbered`, `neutral-source-has-no-host-specific-language`, `pack-questions-have-a-recommended-default`. This work touches the restricted state directory: tests use temporary directories, and a shell call in a session must not name that path in its text (the pre-tool hook denies the whole call; write such text with a file tool).

**Rules the design fixes (do not re-decide):** no entropy detection and no vendored scanner; scanning reads added lines only and is on by default; the allow marker is `go-getter:allow-secret` plus a path list; PII defaults are email, Luhn card and mod-97 IBAN; pseudonym map stores salted hashes only; secrets keep one marker; `secret run` runs only allowlisted commands per `use` path and refuses with none; `secret put` takes stdin or a declared command, no keychain; `sandbox` prints and never writes.

---

## S2 — Secret scanning (governance 0.3.0)

### 1 Shared pattern library — [x]
Class: implement · Needs: none · Check: `node --test compiler/test/secret-patterns.test.mjs compiler/test/apply.test.mjs`
Do: add `compiler/src/secrets/patterns.mjs` exporting the private-key block and token patterns now inlined in `compiler/src/hook.mjs` (`KEY_BLOCK`, `BUILTIN`), JWTs (`eyJ…` three base64url parts) and labelled assignments (`secret|token|password|passwd|api[_-]?key` followed by `=` or `:` and a value of at least 16 non-space characters), each with a `kind` (`private-key`, `aws`, `google`, `github`, `gitlab`, `slack`, `npm`, `anthropic`, `stripe`, `jwt`, `assignment`) and a `findings(text)` function that returns `[{ kind, index, length }]`. `hook.mjs` redaction imports it; its behavior and output do not change.
Done-when: the test shows each kind matched on a sample and not on a near miss (a 15-character value after `token=`, a hash, a lockfile integrity string); the existing redaction tests pass unchanged.

### 2 The `secret-scan` builtin — [x]
Class: implement · Needs: 1 · Check: `node --test compiler/test/secret-scan.test.mjs`
Do: add `compiler/src/checks/builtin/secret-scan.mjs` (`builtin:secret-scan [allow=<globs>] [base=<ref>]`). It collects added lines from `git diff --cached -U0`, from `<base>..HEAD` (base: the argument, else origin's default branch through `defaultBranch` in `git-env.mjs`, as `commit-message` does) and, in CI, from the pull request range; skips a line containing `go-getter:allow-secret` and any file matching `allow`; runs `findings`; and fails with `file:line kind` per finding, never the matched text. No base and nothing staged passes with a message.
Done-when: the test, on temporary repositories, shows a staged file with a GitHub token fails naming file, line and kind and not the token; the same line with the marker passes; a file under an allowed glob passes; a secret that is already on the base branch and untouched passes; a pushed commit range with a secret fails; no base and nothing staged passes.

### 3 Stage-aware checks and a pre-commit hook — [x]
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/apply.test.mjs compiler/test/gate-apply.test.mjs`
Do: let a guardrail's tier-3 enforcement entry list `stages` (any of `pre-commit`, `pre-push`; default `pre-push`; CI always runs every entry). `go-getter check --stage <name>` runs only entries listing that stage (no `--stage` runs all, as now). When any adopted entry lists `pre-commit`, `apply` writes `.githooks/pre-commit` (mode 0755, generated header, records it in the manifest like `pre-push`), and removes it when none does. Update `docs/skills/adding-a-practice-pack.md` and the artifact model for the new field.
Done-when: the tests show `check --stage pre-commit` runs the entry that lists it and skips the others, a project without such an entry gets no pre-commit file, `apply` twice is idempotent, a user-edited `.githooks/pre-commit` is not overwritten without `--force`, and `apply --remove` deletes the generated one.

### 4 Pack questions, guardrail and adoption (0.3.0) — [x]
Class: implement · Needs: 3 · Check: `npm run check:packs && npm run check:self-adoption && npm run check:generated && npm test`
Do: in `src/packs/governance/pack.json` bump to 0.3.0 and add `secret-scan` (choice `on` recommended, `off`; `since: 0.3.0`) and `scan-allow-paths` (list, default none, `when` scan is on). Outputs: a decision per question and the guardrail `no-secrets-in-added-lines` (tier 3 `builtin:secret-scan allow="<paths>"` with `stages: [pre-commit, pre-push]`; tier 1 instruction to avoid pasting secrets). Update the golden fixture and the eval case. Adopt 0.3.0 here with the recommended answers through the update path (`go-getter update`), then `apply` and `npm run build`; the existing guardrail `no-secrets-in-public-repo` stays (it checks names, this checks content).
Done-when: `check:packs` passes; `check:self-adoption` reports governance at 0.3.0; committing a file containing a fake GitHub token in this repository is refused by the pre-commit hook and a line with the marker is accepted; `apply --check` is clean; an older governance answer file renders with scanning on.

## S3 — PII masking (governance 0.4.0)

### 5 Session identity per host — [x]
Class: explore · Needs: none · Check: `npm run check:guardrails`
Do: for each of the seven hosts, from vendor documentation, record in the host's integration-surface fact whether the hook payload carries a session id and whether there is a session-end event; note the one the pseudonym map will key on and the fallback (a project-level map expiring after 24 hours). Mark unconfirmed items **Not confirmed**, with sources and access dates.
Done-when: each host's fact states session id and end event as confirmed or not; the plan's design notes the key per host.

Result, 2026-10-10 (facts 0003-0008, "Session identity"): the pseudonym map is needed only on hosts that can replace tool output, so Cursor and OpenCode need no key. The key is read from the post-tool payload as `session_id`, else `sessionId`, else `sessionID`, else `conversation_id`:

| Host | Key in the post-tool payload | Session end |
|---|---|---|
| Claude Code | `session_id` (confirmed) | `SessionEnd`, `reason`; default 1.5 s timeout, a file delete fits |
| Codex | `session_id` (confirmed) | `SessionEnd`, `reason` (always `other` now) |
| Gemini CLI | `session_id` (confirmed; also `GEMINI_SESSION_ID`) | `SessionEnd`, `reason` |
| Copilot | `sessionId` (default events) or `session_id` (VS Code form), confirmed | `sessionEnd`, `reason` |
| Kilo | `sessionID` in the plugin tool hooks (confirmed from Kilo's source) | not confirmed: use the 24-hour sweep |
| Cursor, OpenCode | not needed (output cannot be replaced) | not applicable |

Step 7 registers the end event on the four hosts that document one (a delete of the session's map file) and relies on the 24-hour sweep for Kilo and for a killed process, which no host documents a guarantee for.

### 6 PII detectors — [x]
Class: implement · Needs: 1 · Check: `node --test compiler/test/pii.test.mjs`
Do: add `compiler/src/secrets/pii.mjs` with `piiFindings(text, { classes })`: `email`; `card` (13-19 digits with optional spaces or hyphens, Luhn-valid); `iban` (country code, two check digits, up to 30 alphanumerics, mod-97 equal to 1); opt-in `phone` (E.164-like with a leading `+` and 8-15 digits) and `national-id` (US SSN `ddd-dd-dddd` with area, group and serial rules). Each returns `{ kind, index, length }`.
Done-when: the test shows a Luhn-valid test card and a valid IBAN match; the same digits with a wrong checksum, a timestamp, a port, a version string and a UUID do not; `phone` and `national-id` match only when listed.

### 7 Pseudonym map and post-tool masking — [x]
Class: implement · Effort: high · Needs: 5, 6 · Check: `node --test compiler/test/pseudonyms.test.mjs compiler/test/redact-pii.test.mjs`
Do: add `compiler/src/secrets/pseudonyms.mjs` (`pseudonymFor(project, sessionKey, kind, value)`): a per-session random salt and a map `hash(salt + value) -> n` per kind, in a 0600 file in the restricted state directory, never the value; `[<kind>-<n>]`; `cleanup(project, sessionKey)` and an expiry sweep for files older than 24 hours. In `evaluatePostTool` replace PII findings with the pseudonym and secret findings with `REDACTED`, count masks per kind (`redactions` in the telemetry line already counts; add kinds, never content), and call `cleanup` on the host's session-end event where step 5 found one.
Done-when: the tests show the same email twice in one session becomes `[email-1]` both times and a second address `[email-2]`; a new session restarts at 1; the file holds no plaintext value (grep for it); the file mode is 0600; a map older than 24 hours is swept; a telemetry line carries counts per kind and no value.

### 8 Pack questions, coverage and adoption (0.4.0) — [x]
Class: implement · Needs: 4, 7 · Check: `npm run check:packs && npm run check:self-adoption && npm run check:generated && npm test`
Do: governance 0.4.0 adds `pii-masking` (`on` recommended, `off`; `since: 0.4.0`) and `pii-extra` (list of `phone`, `national-id`; default none), a decision per question and the guardrail `pii-masked-in-tool-output` (tier 2 `builtin:redact-pii classes="<list>"`; tier 1 instruction). `go-getter coverage` shows component 7's output masking per host and says plainly that Cursor and OpenCode have none (capability `hooks.rewriteOutput` false). Update the golden fixture, the eval case and the README coverage table. Adopt 0.4.0 here.
Done-when: `check:self-adoption` reports governance at 0.4.0; a post-tool payload containing an email on Claude Code returns the output with `[email-1]`; the coverage report names Cursor and OpenCode as unmasked; `apply --check` is clean.

## S4 — `secret run|put` and `sandbox` (governance 0.5.0)

### 9 `secret run` — [x]
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/secret-run.test.mjs`
Do: add `go-getter secret run (--from <dotenv> | --file <path>) -- <command...>` in `compiler/src/commands/secret.mjs` and `compiler/src/secrets/run.mjs`. It refuses unless the path is `use` mode in the adopted restricted modes (`restrictedModes` in `hook.mjs`) and the command, as written, is on that pattern's allowlist (the `use-commands` answer, matched on the exact command text); with no allowlist it refuses and says so. `--from` parses KEY=VALUE lines (comments, quotes, `export ` prefix) into the child's environment; `--file` copies the file to a 0600 temporary file in a private directory, sets the named environment variable to its path and deletes it in a `finally`. The child's stdout and stderr are scrubbed of every secret value and the shared patterns before they are printed; exit code passes through. Telemetry records the event and the path pattern, never a value or the command's arguments.
Done-when: the test shows an allowlisted command receives the variables; a command not on the list, a path not in `use` mode and an empty allowlist are each refused with a message and exit 1; a child that prints a value shows `REDACTED` instead; the temp file is gone after success, failure and a signal; a value never appears in the process arguments, the telemetry line or the error text.

### 10 `secret put` — [ ]
Class: implement · Needs: 9 · Check: `node --test compiler/test/secret-put.test.mjs`
Do: add `go-getter secret put <path> (--stdin | --from-command)` in the same command. It refuses unless the path is `sink` mode; `--from-command` runs the command declared for that pattern in the `sink-sources` answer (the argument names which declared source, never a command text), reads its stdout, and `--stdin` reads standard input. It writes the path with mode 0600 via a temporary file in the same directory and a rename, creates parent directories inside the project only, refuses a path outside the project or a symlink, and prints only the byte count.
Done-when: the test shows a stdin value and a declared command each write the file with mode 0600 and print no value; a path that is not `sink`, a path outside the project, a symlink target and an undeclared command are each refused; a failing command leaves an existing file untouched.

### 11 Activate use and sink in the hook; pack questions and adoption (0.5.0) — [ ]
Class: implement · Effort: high · Needs: 9, 10, 8 · Check: `node --test compiler/test/hook-fields.test.mjs compiler/test/secret-hook.test.mjs && npm run check:packs && npm run check:self-adoption && npm run check:generated`
Do: governance 0.5.0 adds `use-commands` and `sink-sources` (list answers pairing each pattern with its commands or sources; `since: 0.5.0`, default none) and updates the `restricted-modes` decision text from "recorded but inactive" to active. In `evaluatePreTool` a `use` or `sink` path is no longer denied for exactly `go-getter secret run|put` (the existing `secretSubcommand` and the matching mode), and still denied to every other call, to a `run` whose path is `sink` and the reverse. Update the golden fixture and the eval case; adopt 0.5.0 here with no `use` or `sink` patterns (the recommended answer is deny for all).
Done-when: the hook test shows `go-getter secret run --from <use path> -- <cmd>` allowed and `cat <use path>`, a `run` on a sink path, a `put` on a use path and any other go-getter command naming the path denied on every host format; `check:self-adoption` reports governance at 0.5.0; `apply --check` is clean.

### 12 The `sandbox` command — [ ]
Class: implement · Needs: 11 · Check: `node --test compiler/test/sandbox.test.mjs`
Do: add `go-getter sandbox [--host <h>]` (`compiler/src/commands/sandbox.mjs`). For each host with a documented lever it prints a labelled snippet built from the adopted restricted paths and `use` patterns: Claude Code `sandbox.credentials` deny entries (and `mask` for `use` patterns, user settings only), Codex permission-profile `deny` globs, Gemini CLI `security.environmentVariableRedaction`, Copilot `--secret-env-vars` names; each line marked `confirmed` or `not confirmed` from facts 0027 and 0031, and hosts without a lever say so. It writes no file and `apply` is unchanged. Neutral source names no host in shared text (hosts live in the capabilities data).
Done-when: the test shows a snippet per documented host from a fixture project, the unconfirmed marker on lines the facts mark unconfirmed, a message for a host with no lever, `--host` filtering, and that no file is written.

### 13 Docs, lint and close — [ ]
Class: review · Needs: 12 · Check: `npm run check:plans`
Do: add a Sanitization section to README and INSTALLING.md (scanning and its marker, PII masking and its limits, `secret run|put`, `sandbox`, what is not covered), run the full `go-getter:lint` skill, mark L.4 done in the v0.2 plan's backlog and archive this plan.
Done-when: lint reports no new errors; this plan is fully `[x]` and archived.

---

## Open items (not part of these steps)

- Whether secrets should also take pseudonyms: they keep the single marker (decision 0106), so a masked token cannot be told from another; revisit with real use.
- Existing history is not scanned; a project that wants a one-off history scan runs a dedicated tool.
- Prompts are not masked (the prompt hook cannot rewrite), and neither are tool inputs or file writes.
- `git push origin feat:main`-style pushes and wrapped commands are matched on literal text only, as for the gates.
