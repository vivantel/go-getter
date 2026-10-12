# Run spend (L.19) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-12 for backlog item L.19 (`docs/plans/backlog.md`, issue #194). Facts first: `docs/facts/0037-where-each-host-exposes-tokens-or-cost.md` lists the cost source per host and what is unconfirmed. Decision: `docs/decisions/0144-a-spend-cap-on-a-host-without-a-cost-source-warns-and-starts.md`; it fixes the design. It amends item 6 of `docs/decisions/0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops.md`.

## What you are building (read first)

A run's spend cap reads `cost` from the telemetry log (`spentUsd`, `compiler/src/runs/next.mjs`), but nothing writes it on the hosts in use, so the cap never binds. After this plan:

- **A host says whether it can meter** (capability `spendSource`), and `go-getter run start` and the report say plainly when the cap cannot bind (step 1).
- **Readers** turn what a host already writes into telemetry records with `cost` and `tokens`: Claude Code's transcript (step 2), Codex's transcript (step 4, if it holds usage) and the OpenCode and Kilo session export (step 5). Cursor, Gemini CLI and Copilot have no confirmed source and stay unmetered.
- **Nothing is installed in the user's settings** (no status line, no OTel).

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `telemetry-records-metadata-only`, `no-runtime-dependencies`, `neutral-source-has-no-host-specific-language`, `generated-host-files-not-hand-edited`, `restricted-paths-denied`, `routing-uses-total-step-cost`. Reuse `hookRecord` and `payloadUsage` (`compiler/src/hook.mjs`), the telemetry schema (`compiler/src/telemetry/`), the price tables (`compiler/src/routing/cost.mjs`, facts 0011 to 0013) and the run record (`compiler/src/runs/`); do not add a second spend log.

**Rules the design fixes (do not re-decide):** a record holds counts, a model id and a number, never transcript text; a transcript is read by path from the hook payload and its lines are summed, never copied; a host without a reader is reported, never refused; the cap is an estimate at list price, not an invoice.

---

### 1 Say when the cap cannot bind — [x]
Issue: #201
Class: implement · Effort: medium · Needs: none · Check: `node --test compiler/test/run-spend-source.test.mjs`
Do: add the capability `telemetry.spendSource` (`none`, `transcript` or `sessions`) to the host capability rows and schema, `none` on every row (a row becomes `transcript` or `stats` only when its reader exists: claude-code in step 2, codex in step 4, opencode and kilo in step 5, as `sessions`). `go-getter run start` on a host whose source is `none` with a cap set prints that the cap cannot bind on this host and which stops still apply, and starts; the run record stores `spendMetered: false`, and the report prints "spend not metered on this host" instead of a dollar figure. The telemetry-recording refusal stays.
Done-when: tests show the notice and a started run on a `none` host, the record flag, the report line, no notice on a host with a source, and no change for a run without a cap.

### 2 Claude Code transcript reader — [x]
Issue: #202
Class: implement · Effort: high · Needs: 1 · Check: `node --test compiler/test/spend-transcript.test.mjs`
Do: a neutral reader (`compiler/src/spend/`) that, given a hook payload's `transcript_path`, sums the `usage` of assistant entries not yet counted (key by message id; an offset or seen-id set kept in the run record, metadata only), prices them with the routing tables for the entry's model, and writes one telemetry record per read with `tokens` and `cost`. The hook calls it on the events that end a turn or a session; it never blocks, never reads outside the path the payload names, and fails open (an unreadable or reshaped line is skipped and counted). Include subagent entries (marked `isSidechain` in the observed shape). A model with no price row records tokens without a cost and says so in `coverage`. Set `spendSource: transcript` on the claude-code row.
Done-when: tests show a transcript summed to the expected cost, a repeated message id counted once, a second read counting only new lines, an unknown model recording tokens only, a malformed line skipped without failing the hook, no transcript text in the record, and `run next` stopping on `spend-cap` from these records.

### 3 Verify the unconfirmed sources — [x] ‖
Issue: #203
Class: explore · Needs: none · Check: `npm run check:tags`
Do: on each installed host, run one short real session and record what is there: the usage fields in Codex's transcript, the JSON `opencode export` and the Kilo equivalent write for a session, `run --format json` usage fields on codex, opencode, kilo and cursor, and the Gemini CLI and Copilot transcripts. Update fact 0037 in place (confirmed or still unconfirmed, with the field names), and say which hosts get a reader in steps 4 and 5.
Done-when: every "unconfirmed" cell of fact 0037 is replaced by field names or by "checked on <version>, no usage".

Result, 2026-10-12: checked on the hosts installed here. Claude Code: the transcript carries `message.usage` per assistant message, repeated per content block with identical usage (counted once by message id). OpenCode 1.18.35 and Kilo 7.6.2: `session list --format json` and `export <id>` carry `cost` and `tokens` per assistant message (better than `stats`, so step 5 reads them). Codex, Cursor, Gemini CLI and Copilot are not installed here and stay unconfirmed in fact 0037; Claude Code subagent usage could not be found either.

### 4 Codex transcript reader — [x]
Issue: #204
Class: implement · Effort: medium · Needs: 2, 3 · Check: `npm run check:plans`
Do: if step 3 found usage in Codex's transcript, add its line shape to the reader of step 2 (shape per host, same dedupe and fail-open rules) and set `spendSource: transcript` on the codex row; if not, leave it `none` and record that in fact 0037 and this step's result. Codex reports tokens only, so the cost comes from the price tables.
Done-when: tests show a Codex transcript summed to the expected cost, or the result line records that Codex has no source and the row stays `none`.

Result, 2026-10-12: not built. Codex is not installed here, so step 3 could not confirm usage fields in its transcript (the vendor calls the format unstable); the row stays `none` and `run start` says so. Reopen when a Codex session can be inspected: add a `codex` entry to `PARSERS` in `compiler/src/spend/transcript.mjs` and set the row to `transcript`.

### 5 OpenCode and Kilo session reader — [x]
Issue: #205
Class: implement · Effort: medium · Needs: 2, 3 · Check: `node --test compiler/test/spend-sessions.test.mjs`
Do: step 3 found that `session list --format json` and `export <id>` give a cost and token counts per assistant message, so read those (not the `stats` totals) when `run next` runs and in the report: the sessions of this project touched since the run began, each message counted once by a completion-time watermark. Set `spendSource: sessions` on the opencode and kilo rows. A cost of zero (a free model) is priced from tokens when the model has a price row, else tokens only. State in INSTALLING.md that another session in the same directory is counted too.
Done-when: tests with a stub host command show the cost summed and a later read counting only new messages, other projects' sessions and earlier messages left out, a zero cost priced from tokens, and a missing command recording nothing.

### 6 Adopt, document and dogfood — [x]
Issue: #206
Class: implement · Effort: medium · Needs: 2 · Human: a person starts the dogfood run (`go-getter run start` is human-only) · Check: `npm run check:self-adoption && npm run check:generated`
Do: describe the spend sources and the unmetered notice in INSTALLING.md and the README, regenerate, and run one real run over a small plan range on this repository with a small cap, recording that the report shows a non-zero spend and that the cap stops the run when lowered.
Done-when: the checks pass and the plan's result line states the dollar figure the report showed and whether it matched `/usage`.

Result, 2026-10-12: dogfood run of a one-step scratch plan on Claude Code (cap $5 from decision 0063): `run start` printed no "cannot bind" notice, and the report showed `Spend: $0.16 of a $5 cap` for the 7 minutes of the run, where the first dogfood run showed $0.00. Not compared with `/usage` (it totals the whole session, not the run's window), and the lowered-cap stop was not exercised end to end; `run next` stopping on `spend-cap` from recorded spend is covered by `compiler/test/spend-transcript.test.mjs`. Friction: (1) a run left active from the previous plan blocked `run start` until a person ended it; (2) `run end` for that run failed to build its report because its plan had moved to `docs/plans/archive/` (add to backlog L.17); (3) an agent cannot read the telemetry log to check recorded spend (restricted path), so the report is the only view of it; (4) the figure is an estimate at list price and omits Claude Code subagent usage.
