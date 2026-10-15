# Retrieval pack (L.15) — plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[>]` moved to another plan. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains. Step fields as in `docs/plans/v0.2-agent-core-hardening.md` (decision 0069): `Class`, `Effort`, `Tier`, `Needs`, `Human`, `Check`. `‖` marks steps that can run in parallel.

Written 2026-10-12 from an interview with the repo owner (`sergemso`) for backlog item L.15 (`docs/plans/backlog.md`, issue #124). Facts and decisions first: `docs/facts/0038-virage-integration-surface.md` (what virage writes and does today, confirmed and unconfirmed) and `docs/decisions/0145-retrieval-tools-follow-a-go-getter-contract.md` (the contract; it fixes the design and amends item 4 of `docs/decisions/0129-pack-boundaries-neutral-ids-and-a-retrieval-pack.md`). It sits on `docs/decisions/0119-helper-contract-v0.md` (the core never loads a tool's code) and `docs/decisions/0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md`.

## What you are building (read first)

Memory beyond the knowledge base is a `retrieval` pack with a provider-neutral question (`none | virage | other`), virage first. A retrieval tool does not configure the host itself; **go-getter does, under a contract**:

- **Contract** (step 1), versioned and in three parts a tool can meet separately: index policy (no hook or MCP entry of its own; reads a go-getter-generated file of ignore globs, allowed embedder kinds and data class), a declaration (contract version, pre-index secret scan), and a warm local query endpoint that the tool itself starts and announces in a discovery file.
- **Virage conforms** (step 2, in the virage repository) before anything ships.
- **go-getter owns** the MCP entry and the hook that injects retrieved chunks into a prompt (steps 3 and 4), with masking and scanning, so 0138 covers both paths.
- **Index governance** (step 5): restricted paths stay out of the index, secrets are scanned before indexing, a hosted embedder is refused for internal data.

Working rules: `docs/skills/working-a-change.md`; before every PR run `go-getter:capture`, `go-getter:conform`, `go-getter:attribute`. Guardrails to read first: `practice-ships-only-after-self-adoption`, `restricted-paths-denied`, `no-secrets-in-added-lines`, `no-runtime-dependencies`, `neutral-source-has-no-host-specific-language`, `generated-host-files-not-hand-edited`, `owned-files-never-clobbered`, `pack-questions-have-a-recommended-default`. Reuse the pack machinery (`compiler/src/packs/`, `render.mjs`, `apply.mjs`), the MCP governance of 0138 and the masking (`compiler/src/secrets/mask.mjs`, `patterns.mjs`); do not build a second masking path.

**Rules the design fixes (do not re-decide):** go-getter calls the tool's endpoint and never starts or supervises it; retrieved chunks are untrusted data; an unreachable endpoint fails open and a failed governance check fails closed; the pack ships nothing until virage conforms; Claude Code is the only host configured, the others are detected; go-getter never loads the tool's code; the secret text is never shown in a denial or a record.

---

### 1 Write the contract, version 0 — [x]
Issue: #212
Class: plan · Needs: none · Human: the owner reviews the contract before virage is changed to meet it · Check: `npm run check:plans`
Do: fix, in one decision, the three parts of the contract of 0145 item 1, each separately meetable: (a) index policy: the name and location of the generated file, its `contractVersion` and fields (ignore globs, allowed embedder kinds, data class); (b) declaration: how a tool states the contract version it meets and that it scans for secrets before indexing (a file, a command or a manifest field), which step 5 checks; (c) query endpoint: the discovery file the tool writes (address, per-user token, tool version), the transport (a local socket or loopback port), request and response shapes (read-only, bounded result size, a source label per chunk), and the lifecycle, which belongs to the tool (it starts on demand, ends on an idle timeout; go-getter never supervises a process). State the failure rules: an unreachable endpoint fails open (nothing injected, one line said), a failed governance check fails closed. Write it so a second tool could meet it, naming nothing virage-specific.
Done-when: a decision exists with the file fields, the conformance and scan declarations, the discovery file, the failure rules and the lifecycle owned by the tool, and the owner has accepted it.
Result: decision 0146 accepted by sergemso 2026-10-12; the changes virage needs are listed at its end and feed step 2.

### 2 Virage conforms — [~]
Issue: #213
Class: plan · Needs: 1 · Human: the changes are made in the virage repository (the owner's); this repository waits for a release · Check: `npm run check:plans`
Do: list as issues in the virage repository the changes fact 0038 shows are needed: a mode in which `configure()` registers no MCP entry and no hook; reading the generated file (ignore globs applied on top of `fileSets`, refusing a hosted embedder when the data class says so); a pre-index secret scan or an exposed hook for one; the local query endpoint of step 1 (the existing `query-serve` is stdio and parent-owned); `virage uninstall` also removing its `.mcp.json` and settings entries. Record the issue links and the release that meets them here.
Done-when: the virage issues exist and this step's result line names the release that conforms.
Result (2026-10-12): virage issues vivantel/virage#435 (conformance mode and declaration), #436 (read the index policy), #437 (pre-index secret scan), #438 (warm loopback endpoint), #439 (uninstall cleanup). Waiting for the virage release that meets them; the step stays in progress until it is named here.

### 3 The pack skeleton and the MCP entry — [ ]
Issue: #214
Class: implement · Effort: high · Needs: 2 · Check: `node --test compiler/test/retrieval-pack.test.mjs`
Do: add the `retrieval` pack (`none | virage | other`; the recommended default is `none` until a conforming release exists, then `virage`) with the contract file generated from restricted paths, the embedder rule and the data class, the MCP entry for Claude Code in `.mcp.json` (owned, removable), the server added to the `mcp-servers` allowlist and its tools classed under 0138, and an instruction snippet. Detect an install made before conformance (virage's `.mcp.json` entry and its `[Virage]` prompt hook) and migrate it: with the owner's `--force` or approval, remove those entries and write go-getter's own; without it, write nothing and report the unseen injection in `coverage`. A conforming install writes neither. Bump the pack version and keep the golden files in step. Other hosts: detected and reported in `coverage`, nothing written.
Done-when: tests show the file and entry written and removed on update, a pre-conformance install migrated only with approval and otherwise reported, no change for `none`, other hosts reported, and golden files in step.

### 4 The injection hook — [ ]
Issue: #215
Class: implement · Effort: high · Needs: 3 · Check: `node --test compiler/test/retrieval-hook.test.mjs`
Do: a go-getter hook on the prompt event of Claude Code that asks the tool's endpoint for chunks, masks secrets and personal data in them (the shared patterns), masks the outgoing query the same way before it reaches the tool's embedder, applies a size and similarity bound, and injects the result framed as quoted reference material with its source (chunks are untrusted data, never instructions), failing open with a one-line notice when the endpoint is down. It runs as one hook with the existing ones, not a second runner. Record counts only in telemetry (chunks, masked kinds), never text.
Done-when: tests show chunks injected, a secret in a chunk masked, a secret in the prompt masked in the query sent, a chunk containing an instruction injected only inside the quoted frame, an endpoint that is down injecting nothing without failing the prompt, the bound respected, and no chunk text in the telemetry record.

### 5 Index governance checks — [ ]
Issue: #216
Class: implement · Effort: medium · Needs: 3 · Check: `node --test compiler/test/retrieval-index.test.mjs`
Do: a check (`go-getter coverage` and the pack's verification) that fails when a restricted path is not excluded by the generated ignore input, when the configured embedder is hosted and the data class is internal or higher, and when the tool does not declare a pre-index secret scan; each finding names the path, embedder or tool, never content.
Done-when: tests show a restricted path inside the index scope failing, a hosted embedder refused for internal data and allowed for public data, a missing scan declaration failing, and a clean setup passing.

### 6 Decide whether to reverse the hold on an earlier slice — [ ]
Issue: #217
Class: plan · Needs: none · Human: decision 0145 item 3 holds every slice until virage conforms; the owner has not decided whether to reverse that (2026-10-12: "need to consult"), which needs a superseding decision. Candidates are `detect` reporting virage, a prefill of `mcp-servers` with `virage` and a note that every virage tool counts as write, and a `coverage` line that a retrieval tool's own prompt hook injects chunks outside tool-call governance. Decision 0145 holds all of it until virage conforms · Check: `npm run check:plans`
Do: take the owner's answer; if a slice should ship earlier, supersede item 3 of 0145 and add one step per slice to this plan with its done-when; if not, mark this step done with that result.
Done-when: the result line records the owner's answer and any added steps.

### 7 Adopt, document and dogfood — [ ]
Issue: #218
Class: implement · Effort: medium · Needs: 4, 5 · Human: this repository adopts the pack only with a conforming virage release and its own index; the owner decides when · Check: `npm run check:self-adoption && npm run check:generated`
Do: adopt the pack here (guardrail `practice-ships-only-after-self-adoption`), regenerate, describe the contract, the pack and the virage requirement in INSTALLING.md and the README, run a prompt through the hook against this repository's own index, and record in the result line what was friction.
Done-when: the checks pass and the result line states what the dogfood run found, including whether a chunk from a restricted path could reach the prompt.
