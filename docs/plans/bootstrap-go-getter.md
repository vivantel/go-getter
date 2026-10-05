# Bootstrap go-getter — implementation plan

**Status legend**: `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked. Update a step's marker in place as you work; re-reading this file alone must tell any session what remains.

Written 2026-10-04 by `kms:roadmap` interviews with the repo owner (GitHub `sergemso`, org `vivantel`). Nothing below has been executed except step 0.0.

## What you are building (read first)

**Terminology (fact `docs/facts/0002-agent-harness-and-host-agent-terminology.md`)**: Agent = Model + **Harness**. The harness is the 12-component layer around a model: (1) orchestration loop, (2) tool registry, (3) execution sandbox, (4) context management, (5) short/long-term memory, (6) verification & self-correction, (7) guardrails & safety incl. security/DLP/governance, (8) human-in-the-loop gates, (9) state & checkpointing, (10) multi-agent orchestration, (11) token & cost management incl. model routing, (12) observability. **Host agents** are the products that ship a partial harness: Claude Code, Codex, Kilo Code/OpenCode, Cursor, Gemini CLI, GitHub Copilot. Never call a host agent a "harness".

**go-getter** (the name means "one who gets things done" — nothing to do with the Go language) is a set of skills, commands, agents and plugins that, with minimal effort, sets up (a) the agent harness and (b) the SDLC practices (branching, workflow, worktrees, parallelization, testing, coverage, debugging, commit/PR rules, agent roles, release...) for a project, on all six host agents. Its goal is the required quality at minimal token spend. It is dogfooded from commit 0.

Core design — all in `docs/decisions/`; read them before coding, they hold rationale and rejected alternatives:

- **Configure hosts, own no runtime (0015)**: go-getter fills harness components through host extension points (skills, subagents, commands, hooks, permissions/settings, MCP) plus git hooks, CI and small Node scripts. No own agent loop, API client or proxy.
- **Neutral source + compiler (0005)**: authored once under `src/`, compiled to each host's native files; byte-identical outputs are symlinks (copy-mode fallback); outputs committed; CI fails on drift.
- **Guided interview only (0003)**: one question at a time, recommended default per question, repo detection to prefill. No presets.
- **Practice packs (0008)**: declarative `src/packs/<id>/pack.json`, two families — harness packs (declare `components`) and SDLC packs (declare `requires`) — driven by one `init` skill.
- **kms is the source of truth (0007)**: chosen practices live only as kms artifacts in `docs/`; machine-readable data sits under one frontmatter key `go-getter:` (`enforcement`, `generated-by`, `pack-answer`, routing policy, data classes, model registry). Runtime state lives in gitignored `.go-getter/state/`.
- **kms vendored (0006)** in `vendor/kms/`, synced from upstream at a pinned ref; never hand-edited.
- **Tiered enforcement (0009)**: tier 1 instruction, tier 2 host hook/permission, tier 3 git hook + CI (portable floor).
- **Model routing (0016)**: quality-gated cascade; eligibility by data class first; then cheapest (model, effort) tier by *expected total step cost* — cache read/write/uncached pricing, context-handoff cost, expected escalation cost; verification gates each result; bounded escalation then human. A warm-cache pricier model can beat a cold-cache cheaper one.
- **Calibration (0017)**: quality bars = objective checks; metadata telemetry per step; `go-getter routing calibrate` proposes policy changes as kms decisions (v0.2).
- **Governance/DLP (0018)**: data classes by path; approved-model registry (provider, region, retention/ZDR, local vs cloud); tiered DLP.
- **Agent roles (0014)** compiled to native subagents with per-role model/effort; **self-hosting ratchet (0010)**; **Node ESM, zero runtime deps, Node = oldest supported LTS (currently 22) with fail-open shims where Node is absent (0019, supersedes 0011)**; **public MIT repo `vivantel/go-getter` (0012)**; **3-layer verification of go-getter itself (0013)**.
- **Milestones (0004)**: v0.1 = foundation + orchestration, context, cost & routing, governance/DLP, minimal verification gate and telemetry. v0.2 = calibration, observability, HITL, checkpointing. v0.3 = git workflow. v0.4 = testing/coverage/debugging, memory beyond kms.

**Knowledge base conventions** (kms format): `docs/{facts,decisions}/NNNN-slug.md` (4-digit, per-directory, next free number), `docs/{guardrails,skills}/slug.md`; frontmatter `id, title, status, date, tags` (tags only from `docs/skills/tags.md`; propose additions there first); every directory has a CSV `INDEX.md` (`id,title,tags,status`) updated whenever an artifact is added. Accepted decisions are immutable once committed — change them by a new decision and mark the old `superseded` with `superseded-by`. Every guardrail carries `go-getter.enforcement`. Artifact model: `/home/ubuntu/.claude/plugins/cache/kms/kms/0.15.0/shared/artifact-model.md` (or `plugins/kms/shared/artifact-model.md` in `github.com/vivantel/kms`).

**Reference implementation of similar packaging**: `/home/ubuntu/projects/vivantel/kms` (local) = `github.com/vivantel/kms`: `.claude-plugin/marketplace.json`, `plugins/kms/.claude-plugin/plugin.json`, `plugins/kms/.codex-plugin/plugin.json`, `kilo.jsonc`, `plugins/kms/skills/index.json`, `.github/workflows/`, `evals/`, `AGENTS.md`, `docs/skills/adding-agent-support.md`. Confirm formats from vendor docs (phase 1); do not copy blindly.

**Interim working rules (until v0.3 replaces them, decision 0004)**: after the bootstrap commit, never push to `main`. Every step is a short-lived branch `type/slug` → PR → squash merge. Conventional Commit titles with `Refs:` trailers to the `docs/` artifacts implemented (the `kms:attribute` skill writes these). One git worktree per parallel task (`git worktree add ../go-getter-wt/<slug> -b <branch>`). Steps marked **‖** may run in parallel.

## Known enforcement debt (from capture, 2026-10-05)

- `routing-uses-total-step-cost` and `routing-escalation-bounded` run `npm run test:routing`, and `telemetry-records-metadata-only` runs `npm run test:telemetry`; the two routing checks pass vacuously until step 5.6 adds their tests (5.3 added the eligibility tests, 5.4 the telemetry tests).
- The `context` pack's cache-hygiene guardrail is tier 1 only: the hook runtime (0025) has no pre-model-switch event, so the confirm-before-switch hook of decision 0027 is not generated yet. The instruction-file cap covers `AGENTS.md` only, not non-symlinked host instruction files.
- The `governance` pack: tool-output redaction (0018) is not implemented; the hosts rule is a tier-1 guardrail plus the prompt-logging scope; `apply` does not undo a prompt-logging setting when the decision changes; the hook runtime (0025) matches every string in a tool call against the restricted patterns, so any dotted token that ends like a key file (a property access in code, say) is blocked by the key-file pattern (false positives, seen while building this step); path-deny support on Codex and Copilot is unconfirmed (fact 0009).
- The `verification-gate` pack: the stop hook only gates a working tree with changes and runs the `implement` checks; Copilot and Kilo/OpenCode have no blocking stop hook (tier 1); the Codex `Stop` and Cursor `followup_message` shapes are unconfirmed (fact 0023).
- Decision 0019's PowerShell shims are not implemented; the runner is POSIX `sh` only.

## Open questions (resolve in the named step; record answers as facts/decisions)

- Pack file format: JSON (default) vs restricted YAML subset (4.1).
- How far each host can enforce DLP (1.7 → 5.3).
- Eval authentication on CI: kms runs evals with zero API keys / free models (`/home/ubuntu/projects/vivantel/kms/docs/facts/0012-kilo-gateway-free-tier-access.md`, `0015-improvement-harness-zero-api-keys.md`). Reuse that or ask the owner for a secret (6.1).

---

## Phase 0 — Repo bootstrap

### 0.0 Knowledge base seeded — [x]
Done in the roadmap sessions: `docs/decisions/0001-0018`, `docs/facts/0001-0002`, `docs/guardrails/*` (17, incl. the 5 kms baseline guardrails adopted as project-owned in 0.3), `docs/skills/*` (3 procedures + `tags.md`), an `INDEX.md` in each, and this plan.

### 0.1 Preflight — [x]
Context: `/home/ubuntu/projects/vivantel/go-getter` contains only `docs/` and is not a git repo; the GitHub repo does not exist yet.
Do: run `git --version`, `node --version`, `gh auth status`, `gh api user/orgs --jq '.[].login'`, `gh repo view vivantel/go-getter`.
Done-when: git and Node (≥ oldest supported LTS, decision 0019) present; `gh` logged in as `sergemso`; org list includes `vivantel`; `gh repo view vivantel/go-getter` fails with "Could not resolve to a Repository". If the repo exists, stop and ask the owner.

### 0.2 Root files — [x]
Context: license, ignore rules, a short agent instruction file and README before the first commit. Keep `AGENTS.md` short (it is loaded into every session).
Do: create
- `LICENSE` — MIT, `Copyright (c) 2026 vivantel` (same text as `/home/ubuntu/projects/vivantel/kms/LICENSE`).
- `.gitignore` — `node_modules/`, `.env`, `.env.*`, `.go-getter/state/`, `evals/scratch/`.
- `AGENTS.md` — what this repo is (2 sentences, terminology "harness" vs "host agent", pointer to `docs/decisions/0001-go-getter-product-scope-and-name.md`); knowledge-base conventions; the interim working rules above; "Remaining work and step status live in `docs/plans/bootstrap-go-getter.md` — update markers as you go."
- `CLAUDE.md` — symlink to `AGENTS.md` (`ln -s AGENTS.md CLAUDE.md`), as kms does.
- `README.md` — one paragraph ("configures the agent harness and SDLC practices of six host agents..."), the host list, "v0.1 in progress", link to the plan.
Done-when: all five exist; `ls -l CLAUDE.md` shows `CLAUDE.md -> AGENTS.md`; `LICENSE` begins `MIT License` / `Copyright (c) 2026 vivantel`; `.gitignore` contains `.go-getter/state/`.

### 0.3 Lint the knowledge base — [x]
Result: no structural violations; kms's 5 baseline guardrail templates were missing (check 12) and were adopted as project-owned guardrails with `go-getter.enforcement`.
Context: confirm seeded artifacts are structurally valid. The `go-getter:` frontmatter key is a go-getter extension (0007); kms may flag it as unknown.
Do: run `/kms:lint`. Fix real problems. If only the `go-getter:` key is flagged, leave it and note it for step 7.2.
Done-when: lint reports no errors other than, at most, the known `go-getter:` extension; every `docs/*/INDEX.md` row matches an existing file.

### 0.4 Initial commit — [x]
Do: `git init -b main`, `git add -A`, commit `chore: bootstrap repo with knowledge base and plan` with `Refs:` trailers for `docs/decisions/0001-go-getter-product-scope-and-name.md` and `docs/decisions/0010-self-hosting-ratchet.md`. Only this commit goes straight to `main`.
Done-when: `git log --oneline` shows one commit on `main`; `git status` clean; `git ls-files -s CLAUDE.md` shows mode `120000`.

### 0.5 Create the GitHub repo — [x]
**Outward-facing and public (0012): confirm with the owner immediately before running.** Re-read `docs/` once for anything that should not be public.
Do: `gh repo create vivantel/go-getter --public --source=. --remote=origin --description "Set up the agent harness and SDLC practices for Claude Code, Codex, Kilo, Cursor, Gemini CLI and Copilot — quality-gated, cost-aware, zero friction" --push`; then `gh repo edit vivantel/go-getter --add-topic ai-agents --add-topic agent-harness --add-topic agents-md --add-topic developer-tools --add-topic sdlc`.
Done-when: `gh repo view vivantel/go-getter --json visibility,licenseInfo,defaultBranchRef` shows `PUBLIC`, `MIT`, `main`; `git ls-remote origin main` equals local `HEAD`.

### 0.6 Repo settings and protection — [x]
Context: interim workflow is PR + squash into protected `main` (0004); guardrail `no-secrets-in-public-repo` needs secret scanning + push protection.
Do:
- `gh api -X PATCH repos/vivantel/go-getter -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
- `gh api -X PATCH repos/vivantel/go-getter --input -` with `{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}`
- `gh api -X PUT repos/vivantel/go-getter/branches/main/protection --input -` with `{"required_status_checks":null,"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}` (status checks are added in 2.7).
Done-when: `gh api repos/vivantel/go-getter --jq '{s:.allow_squash_merge,m:.allow_merge_commit,r:.allow_rebase_merge,d:.delete_branch_on_merge,sa:.security_and_analysis}'` shows squash-only, delete-on-merge, both secret-scanning settings `enabled`; a direct `git push origin main` of a throwaway commit is rejected (then discard it).

---

## Phase 1 — Host-agent and model facts (research; no code)

Context: the compiler and every harness pack depend on what each host exposes. Follow `docs/skills/adding-a-host-agent.md` step 1 exactly: vendor primary documentation only, record what could not be confirmed. Each host fact: `kind: environmental`, `governed-by: 0002-six-host-agents-from-v0-1`, sections matching that procedure's list (instruction files; skills/agents/commands; packaging & install; headless invocation; hooks & permissions; per-agent model + effort; local/custom endpoints; prompt caching & visibility; telemetry/OTel & cost reporting; DLP levers; native harness components; Node availability), plus **Not confirmed** and **Sources** (URLs with access date). First add tags `claude-code`, `codex`, `kilo-opencode`, `cursor`, `gemini-cli`, `copilot` to `docs/skills/tags.md`. Numbers are pre-assigned to avoid collisions. Update `docs/facts/INDEX.md`. Steps 1.1-1.6 and 1.9 are **‖**.

- **1.1** Claude Code → `docs/facts/0003-claude-code-integration-surface.md` — [x]
- **1.2** Codex → `docs/facts/0004-codex-integration-surface.md` (related kms fact: `/home/ubuntu/projects/vivantel/kms/docs/facts/0003-codex-plugin-manifest-schema.md`; re-verify) — [x]
- **1.3** Kilo Code CLI / OpenCode → `docs/facts/0005-kilo-opencode-integration-surface.md` (see kms facts 0008, 0009) — [x]
- **1.4** Cursor → `docs/facts/0006-cursor-integration-surface.md` — [x]
- **1.5** Gemini CLI → `docs/facts/0007-gemini-cli-integration-surface.md` — [x]
- **1.6** GitHub Copilot (agent mode, coding agent, custom agents, instruction files) → `docs/facts/0008-copilot-integration-surface.md` — [x]

Done-when (each of 1.1-1.6): the file exists with every listed section; each claim cites a vendor URL or sits under **Not confirmed**; its INDEX row exists.

### 1.7 Capability matrix — [x]
Do: `docs/facts/0009-host-capability-matrix.md` (`kind: derived`, `governed-by: 0005-neutral-source-compiler-architecture`): rows = six hosts; columns = instruction file, skills, subagents, commands, blocking hooks, permissions/path deny, per-agent model, effort control, local endpoints, cache visibility, telemetry export, DLP levers, plugin packaging, Node available, symlink-candidate outputs, and for each of the 12 harness components the highest enforcement tier reachable (0009).
Done-when: every cell cites one of facts 0003-0008 or says "unconfirmed"; INDEX row exists.

### 1.8 Resolve the Node question — [x]
Result: Node is not available at runtime on Claude Code, Codex or Cursor installs; decision 0019 supersedes 0011 (Node floor = oldest supported LTS, fail-open shims), fact 0010, guardrail `node-floor-is-oldest-supported-lts`.
Context: 0011 states Node availability per host was unverified.
Do: read the Node column of fact 0009. If Node is unavailable where hooks or tier-3 scripts must run, write a decision superseding 0011 (set 0011 `status: superseded`, `superseded-by`, update INDEX); otherwise note confirmation in the PR.
Done-when: no unavailable cell, or the superseding decision exists and 0011 has `status: superseded` with a valid `superseded-by`.

### 1.9 Model pricing and terms facts ‖ — [x]
Result: facts 0011 (Anthropic), 0012 (OpenAI), 0013 (Google; expires 2026-12-31 because Flash prices double 2027-01-01), 0014 (local endpoints per host, derived).
Context: the cost model (0016) needs real prices including cache economics; the governance registry (0018) needs data-handling terms.
Do: one fact per model provider usable from the six hosts (at least Anthropic, OpenAI, Google; add others the hosts support), next free fact numbers, e.g. `docs/facts/NNNN-model-pricing-anthropic.md`: per model — input, output, cache-write and cache-read prices, cache TTLs and minimum cacheable size, effort/reasoning-token pricing, context window, data retention / zero-data-retention options, regions. `kind: environmental`, `governed-by: 0016-quality-gated-cache-aware-model-routing`, `expires: 2027-01-04` (prices change; re-verify by then). Put the machine-readable table under `go-getter: { models: [...] }`. Add one fact for local-model options the hosts support (endpoint types, no per-token price).
Done-when: each provider fact exists with vendor pricing-page URLs and access dates, a parseable `go-getter.models` list, and an INDEX row.

### 1.10 Decide the runtime routing mechanism — [x]
Result: decision 0020 (compiled per-role defaults + delegation-time router hook + hook-gated bounded escalation; tier 2 on Claude Code, Codex, Cursor, Gemini CLI; advisory on Copilot).
Context: 0016 deferred how routing executes on each host. Inputs: fact 0009 (per-agent model, effort, hooks, delegation) and 1.9 prices.
Do: write decision `<next>-routing-runtime-mechanism` covering per host: how a step's model/effort is selected (compiled per-agent settings, delegation rules in instructions, an optional `go-getter route --class <c> --context-tokens <n> --cache warm|cold` helper the orchestrating agent calls), how verification failure triggers escalation, how escalation count is bounded, and what is approximated or advisory where a host lacks a lever.
Done-when: the decision exists with an INDEX row and names, per host, the mechanism and its enforcement tier.

---

## Phase 2 — Compiler foundation

### 2.1 Scaffold and layout decision — [x]
Result: decision 0021 (layout; host ids `claude-code`, `codex`, `kilo-opencode`, `cursor`, `gemini-cli`, `copilot`); `package.json`, CLI dispatcher `compiler/bin/go-getter.mjs` (commands in `compiler/src/commands/`, checks in `compiler/src/checks/`), `check:deps` implemented, smoke tests.
Context: guardrails and procedures assume this layout: `src/` (neutral source: `skills/<name>/SKILL.md`, `agents/<role>.md`, `commands/<name>.md`, `rules/<name>.md`, `packs/<id>/pack.json`), `compiler/` (`bin/go-getter.mjs`, `src/`, `src/routing/`, `src/telemetry/`, `src/checks/`, `adapters/<host>.mjs`, `capabilities/<host>.json`, `schemas/`, `test/`), `vendor/kms/` + `vendor/kms.lock.json`, `evals/`, `.github/workflows/`, and npm scripts `build`, `test`, `test:routing`, `test:telemetry`, `sync:kms`, `check:generated`, `check:neutral`, `check:guardrails`, `check:tags`, `check:node-floor`, `check:self-adoption`, `check:vendor`, `check:deps`, `check:packs`, `eval`.
Do: create `package.json` (`"type":"module"`, `"private":true` until release, `engines.node` = `>=22` (oldest supported LTS per decision 0019 / fact 0010), **no `dependencies`**, the scripts as stubs that exit 0 printing "not yet implemented"), the directory skeleton, a `node:test` smoke test. Write decision `<next>-neutral-source-and-output-layout` fixing neutral-source formats and frontmatter, each host's output paths for both output kinds (distributable packaging; project-local files `init` generates — 0005), manifest schema, symlink vs copy mode. Use fact 0009.
Done-when: `npm test` passes; `npm run check:deps` exits 0; the layout decision exists with an INDEX row; every path named in `docs/guardrails/*.md` and `docs/skills/adding-a-*.md` exists or is in the layout decision (fix whichever is wrong).

### 2.2 Parsing core — [x]
Result: `compiler/src/frontmatter.mjs` (`parseFrontmatter`, `parseYaml`, `stringifyYaml`, `stringifyFrontmatter`); 13 tests; also verified identical to PyYAML on all 163 frontmatter files of vivantel/kms.
Do: `compiler/src/frontmatter.mjs` — zero-dep parser/serializer for the YAML subset used in `docs/` (scalars, inline and block lists, nested maps, lists of maps, inline flow maps `{k: v}` — needed for `go-getter.enforcement` and the `go-getter.models` lists in facts 0011-0013). `node:test` tests.
Done-when: `npm test` passes, including a test that parses every `docs/**/*.md` frontmatter in this repo without error.

### 2.3 Capabilities manifests — [x]
Result: six manifests in `compiler/capabilities/`, `compiler/schemas/capabilities.schema.json`, zero-dep validator `compiler/src/schema.mjs` (reused for the pack schema in 4.1), loader `compiler/src/capabilities.mjs`.
Do: `compiler/capabilities/<host>.json` ×6, `compiler/schemas/capabilities.schema.json` and a validator, populated strictly from fact 0009 (unconfirmed → `false` with a `note`).
Done-when: six manifests validate in `npm test`; each cites its fact id.

### 2.4 Adapters ‖ — [x]
Result: all six adapters in `compiler/adapters/<host>.mjs` (shared helpers `compiler/src/emit.mjs`; moved there from `build.mjs` after a capture pass found the drift), shipped as one PR rather than six because they share one emitter and golden test; distributable packaging ships skills + manifests only — agents/hooks are project-local (`apply`, 4.4). Fixture repo `compiler/test/fixtures/repo` + golden `compiler/test/golden/build.json` (`UPDATE_GOLDEN=1` to refresh). `check:generated` implemented early. Resolutions recorded in fact 0015; `claude plugin validate --strict` passes.
Do: per `docs/skills/adding-a-host-agent.md` steps 3-4, one adapter per host in `compiler/adapters/<host>.mjs`: emit native files from `src/` for both output kinds, symlinks for byte-identical outputs (`--copy` fallback), fall back down the tiers and mark outputs advisory where a feature is missing. Split 2.4a Claude Code, 2.4b Codex, 2.4c Kilo/OpenCode, 2.4d Cursor, 2.4e Gemini CLI, 2.4f Copilot — each its own branch/PR. Seed `src/skills/hello/SKILL.md` so output is non-empty.
Done-when (each): `node compiler/bin/go-getter.mjs build --host <h>` emits that host's files for the sample skill; its golden test passes; output matches the host fact (0003-0008).

### 2.5 Build CLI and deterministic checks — [x]
Result: `check:neutral`, `check:guardrails`, `check:tags`, `check:node-floor` (live Node schedule; `GO_GETTER_OFFLINE=1` skips) plus earlier `check:deps`, `check:generated`; shared artifact reader `compiler/src/artifacts.mjs`; 29 tests.
Do: `compiler/bin/go-getter.mjs` with `build` and the npm scripts: `build`; `check:generated` (rebuild to temp, diff against committed — guardrail `generated-host-files-not-hand-edited`); `check:neutral` (guardrail `neutral-source-has-no-host-specific-language`); `check:deps`; `check:guardrails` (guardrail `guardrails-declare-enforcement`: every `docs/guardrails/*.md` has `go-getter.enforcement`, tier 2/3 entries have `run`, tier-1-only marked advisory); `check:tags` (guardrail `tags-from-canonical-list`); `check:node-floor` (guardrail `node-floor-is-oldest-supported-lts`: fetch `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`, compare with `engines.node`).
Done-when: each of the six `check:*` scripts exits 0 on this repo and non-zero in a test with a violating fixture; generated files for the sample skill are committed.

### 2.6 CI — [x]
Result: `.github/workflows/ci.yml` (jobs `test`, `golden`, `checks`; Node 22; actions pinned by SHA); green on PR #16.
Do: `.github/workflows/ci.yml` on `pull_request` and push to `main`: jobs `test` (`npm test`), `golden` (`npm run build && git diff --exit-code`, `npm run check:generated`), `checks` (`check:neutral`, `check:guardrails`, `check:tags`, `check:deps`, `check:node-floor`). Pin actions by SHA.
Done-when: a PR run shows all three jobs green.

### 2.7 Require CI on `main` — [x]
Done-when: `gh api repos/vivantel/go-getter/branches/main/protection --jq .required_status_checks.contexts` lists `test`, `golden`, `checks` (strict).

---

## Phase 3 — Vendored kms

### 3.1 Sync script and pin — [x]
Result: `scripts/sync-kms.mjs`, `compiler/src/vendor.mjs`, `check:vendor` (also in CI); pinned kms 0.15.0 @ 4cdd5bb8; lockfile supports `excludeSkills`.
Context: decision 0006, `docs/skills/syncing-vendored-kms.md`.
Do: `scripts/sync-kms.mjs` (zero-dep, `git` via `child_process`): shallow-clone `vivantel/kms` at a release tag (latest from `git ls-remote --tags https://github.com/vivantel/kms`), replace `vendor/kms/` wholesale, write `vendor/kms.lock.json` `{repo, ref, sha}`; `npm run sync:kms -- <ref>`; `check:vendor` (re-fetch the pin, diff — guardrail `vendored-kms-changes-only-via-sync`).
Done-when: `npm run sync:kms -- <tag>` populates `vendor/kms/` and the lockfile; `npm run check:vendor` exits 0, and non-zero after a test edit to a vendored file (revert it).

### 3.2 Compile kms to six host agents — [x]
Result: 14 kms skills + `shared/` + `templates/` compiled for all hosts; reference-resolution test passes for plugin root and Gemini repo root; Kilo remote-index limitation and unshipped kms hooks recorded in fact 0019.
Context: a kms plugin root has `skills/`, `hooks/`, `shared/`, `templates/`; skill bodies reference `../../shared/artifact-model.md` (fact 0001); kms has a Claude Code hook (`capture-nudge.sh`).
Do: adapters include `vendor/kms/` skills with relative layout preserved; map kms hooks only where fact 0009 allows; keep upstream skill names.
Done-when: a test walks every relative reference in every compiled kms `SKILL.md` per host and finds an existing file; `npm run check:generated` exits 0.

---

## Phase 4 — Pack schema and interview engine

### 4.1 Pack schema — [x]
Result: decision 0022; `compiler/schemas/pack.schema.json`; `compiler/src/packs.mjs` (schema + semantic validation, `parseRun`); `check:packs` (also `--file`, in CI); example fixture `compiler/test/fixtures/packs/example/pack.json`; validator gained `$ref`.
Do: decision `<next>-pack-schema-and-enforcement-run-grammar` fixing (a) file format (JSON unless the open question decides otherwise); (b) fields: `id, version, family (harness|sdlc), components[] (harness: 1-12 per fact 0002), requires[], title, summary, questions[{id, prompt, detect?, options[{id, label, tradeoff, recommended?}], multi?, when?}], outputs{<question-id>:{<option-id>:{decisions[], guardrails[], procedures[], facts[], files[]}}}`; templates are Markdown with `{{placeholders}}` and kms frontmatter; emitted artifacts carry `go-getter.generated-by` and `go-getter.pack-answer` (0007, 0008); (c) the grammar of `go-getter.enforcement[].run`: `builtin:<check-id> k=v ...` or a literal command. Then `compiler/schemas/pack.schema.json`, validator, `npm run check:packs`, a valid example at `compiler/test/fixtures/packs/example/pack.json` and invalid fixtures.
Done-when: decision + INDEX row exist; `npm run check:packs` passes the example; `npm test` shows each invalid fixture rejected naming the offending field.

### 4.2 Detection probes — [x]
Result: `compiler/src/detect.mjs` + `go-getter detect [dir]`: languages, package managers, test frameworks, linters, typecheckers, CI, monorepo, host agents, agent files, kms, sensitive paths, git default branch/remote host; fixture tests for empty, Node/TS and Python repos.
Do: `compiler/src/detect.mjs` + `go-getter detect` → JSON: languages, package manager, test framework, linters/typecheckers, CI provider, default branch, remote host, monorepo layout, existing host-agent files (`AGENTS.md`, `CLAUDE.md`, `.cursor/`, `GEMINI.md`, `.github/copilot-instructions.md`...), existing kms `docs/`, likely-sensitive paths (for data-class prefill: `.env*`, `secrets/`, keys, customer data dirs).
Done-when: tests over at least three fixture dirs (Node, Python, empty) assert exact JSON.

### 4.3 `init` skill and deterministic renderer — [x]
Result: skill named `go-getter-init` (`src/skills/go-getter-init/`, with examples) because two hosts ship a built-in `/init`; CLI reached via `npx --yes github:vivantel/go-getter` (decision 0023); `compiler/src/render.mjs` + commands `packs`, `pack <id>`, `render-pack` (`--dry-run`, `--project`, `--pack-file`); unknown tags are appended to `docs/skills/tags.md` and listed in the dry run; golden `compiler/test/golden/render-example.json`.
Context: 0003 and 0008. The skill drives the conversation; a deterministic renderer writes files so numbering and INDEX updates never depend on the agent.
Do: `compiler/src/render.mjs` + `go-getter render-pack <pack-id> --answers <file>` (next-free numbering, frontmatter, tag check against `docs/skills/tags.md`, INDEX rows); `src/skills/init/SKILL.md` + `examples.md`, neutral wording: list packs by family, ask which to configure (recommend all v0.1 harness packs), run `go-getter detect`, ask one question at a time with each option's tradeoff and the recommended one marked, offer "accept recommended defaults for the rest", list every file to be written and get one go-ahead, call `render-pack` then `apply` (4.4).
Done-when: a golden test renders `example` from a fixed answers file to byte-identical expected artifacts; `npm run check:neutral` passes on the skill; `npm run build` emits `init` for all six hosts.

### 4.4 `apply` and the enforcement materializer — [x]
Result: `compiler/src/apply.mjs` (+ `go-getter apply [--hosts] [--check]`): runner `.go-getter/bin/go-getter` (fail-open without Node, decision 0019), AGENTS.md section, `CLAUDE.md` symlink, Gemini `context.fileName`, host hook configs merged into existing settings (tier 2), `.githooks/pre-push` + `core.hooksPath` and `.github/workflows/go-getter-checks.yml` (tier 3). One shared tier-2 runtime `go-getter hook pre-tool --host <id>` (`compiler/src/hook.mjs`; builtin `deny-path`); `go-getter check` runs all tier-3 entries (`compiler/src/enforce.mjs`); builtins `path-exists`, `file-max-lines`, `branch-name`, `commit-message`, `gitignore-includes`, `workflow-needs`, `deny-path`. Applied to this repo (15/15 tier-3 checks pass; pre-push ~4s); `check:generated` also verifies apply output. Unverified host details: Codex hooks.json shape, Copilot deny JSON, Kilo plugin dir (`.opencode/` emitted); no Windows `.cmd` runner yet.
Context: 0009 and `go-getter.enforcement` (0007).
Do: `go-getter apply` reads `docs/guardrails/*.md` frontmatter and emits: tier 3 — `.githooks/*` + `git config core.hooksPath .githooks`, and `.github/workflows/go-getter-checks.yml` running `go-getter check`; tier 2 — host hook/permission files where the capability manifest allows; tier 1 — a generated `AGENTS.md` section between `<!-- go-getter:start -->` / `<!-- go-getter:end -->` (text outside the markers untouched; covered by the drift check). `go-getter check` runs every tier-3 `run` (grammar from 4.1) and exits non-zero on failure. Built-in checks in `compiler/src/checks/`: `command`, `path-exists`, `file-max-lines`, `branch-name`, `commit-message`.
Done-when: running `apply` twice leaves no diff after the second run; `go-getter check` exits 0 on this repo and non-zero in a test with a fixture violating one guardrail; `npm run check:generated` covers the `AGENTS.md` generated section.

### 4.4b Project-local skills for hosts without plugin installs — [x]
Result: `apply` writes `.agents/{skills,shared,templates}` from the package's compiled plugin (default when `kilo-opencode` is a host; `--skills` / `--no-skills` override) plus `.claude/{skills,shared,templates}` symlinks when Claude Code is a host; covered by `apply --check`. Stale skills removed upstream are not yet pruned.
Context: decision 0021 (output kind B) and fact 0019 say `apply` provides `.agents/skills/` (+ `.claude/skills` symlink) so Kilo remote installs get kms's `shared/`/`templates/` references; `apply` does not emit skills yet (found by capture, 2026-10-05).
Do: add an opt-in `apply --skills` (default on for `kilo-opencode`) that copies the go-getter package's compiled skills and support dirs into `.agents/skills/` and `.agents/{shared,templates}/`, with the `.claude/skills` symlink when `claude-code` is a host; include them in `diffApply`.
Done-when: a test applies with `--hosts kilo-opencode` to a fixture and every `../../shared` reference in `.agents/skills/*/SKILL.md` resolves; `apply --check` covers the files.

### 4.5 Reconfigure — [x]
Result: `compiler/src/reconfigure.mjs` + `go-getter reconfigure <pack> --answers <file> [--dry-run] | --current`. Changed answers supersede their decisions (with `superseded-by`); non-decision artifacts are re-rendered in place (re-derivation); artifacts no longer produced become `deprecated`; INDEX statuses updated. Emitted artifacts now also carry `go-getter.pack-option` (needed to recover answers; extends decision 0022). Skill `go-getter-init` documents the flow.
Do: `go-getter reconfigure <pack-id>`: re-ask the pack's questions with current answers (read via `go-getter.generated-by` / `go-getter.pack-answer`) as defaults; for each changed answer write a new decision, mark the old `superseded` with `superseded-by`, regenerate dependent guardrails, update INDEX files. Add the step to the `init` skill.
Done-when: a test changes one answer and asserts the old decision is `superseded` with valid `superseded-by`, the new one exists, INDEX rows match files.

### 4.6 Harness coverage report — [x]
Result: `compiler/src/coverage.mjs` + `go-getter coverage [--json]`: per component, adopted packs and per-host tier (`ci` / `hook` / `advisory`; tier-2 rules capped by the host capabilities manifest). This repo shows every component as `none` until Phase 5 adopts packs. `go-getter-init` reports it after `apply`.
Context: fitness function of 0008.
Do: `go-getter coverage` prints, for this project, each of the 12 harness components with the packs covering it and the strongest tier achieved per host (from capabilities manifests).
Done-when: a test on a fixture with two packs asserts the exact report; running it on this repo lists every component (uncovered ones explicitly as "none").

---

## Phase 5 — v0.1 harness packs

Each pack follows `docs/skills/adding-a-practice-pack.md`; questions and recommended defaults are fixed by decisions 0026–0032.

### 5.0 Self-adoption check — [x]
Result: `compiler/src/checks/self-adoption.mjs` (exact `<id>@<version>`, active artifacts only).
Do: implement `npm run check:self-adoption`: every pack under `src/packs/` has at least one artifact in `docs/` whose `go-getter.generated-by` equals `<pack-id>@<version>`.
Done-when: exits 0 when `src/packs/` is empty or every pack is adopted; non-zero in a test where a pack lacks a matching artifact.

### 5.0b Typed answers, detected commands and the recommended-default rule — [x]
Context: decision 0026 extends the pack format (0022): questions get `type: choice | text | list` (text/list: no options, optional `pattern`, `default`, `detect`); `{{answer.<q>}}` substitutes text as-is and lists comma-joined; templates may use `{{detect.<key>}}`. Guardrail `pack-questions-have-a-recommended-default` requires exactly one recommended option per choice question and a `default` or `detect` key on text/list questions — `check:packs` does not enforce "exactly one" yet (it checks "at most one").
Do: extend `compiler/schemas/pack.schema.json` (`type`, `pattern`, `default`; options required only for `choice`), `compiler/src/packs.mjs` (exactly-one rule; text/list need `default` or `detect`; `when` may reference text questions only via `in` against their value), `compiler/src/render.mjs` (validate text answers against `pattern`; list answers as arrays), `compiler/src/detect.mjs` (add `commands: {test, lint, typecheck}` inferred from package.json scripts, pyproject/Makefile conventions, go/cargo), and the `go-getter-init` skill (ask text/list questions with the prefilled value). Add tests for each rule and update `compiler/test/fixtures/packs/example/pack.json` if needed.
Done-when: `npm test` passes with new cases (text answer rejected by pattern; list rendered comma-joined; a choice question with zero recommended options rejected); `go-getter detect` on this repo reports `commands.test` = `npm test`; `npm run check:neutral` passes.

Every pack below is done only when: it validates (`npm run check:packs`); this repo has adopted it via `render-pack` and committed the generated artifacts (carrying `go-getter.generated-by: <pack>@0.1.0`; the answers file under `.go-getter/state/` stays uncommitted); `npm run check:self-adoption` passes; `go-getter apply` has been re-run and its outputs committed; and the PR followed the AGENTS.md checklist (capture, conform, attribute). Build order: 5.1 and 5.2 ‖, then 5.3, then 5.4 and 5.5 ‖, then 5.6.

### 5.1 Pack `context` (component 4) — [x]
Result: `src/packs/context/pack.json`, adopted here as decisions 0033–0037; confirm-before-switch hook deferred (see enforcement debt).
Context: decision 0027. Questions (recommended first): (1) instruction-file cap — 150 lines / 300 / none → guardrail tier 3 `builtin:file-max-lines path=AGENTS.md max=<n>` (also the host's own instruction file when it is not a symlink); (2) procedures — skills on demand / always-on rules / one-line pointers → decision + tier-1 instruction; (3) noisy work — delegate when the cost model says so / always / inline → decision + tier-1 instruction referencing the cost-routing pack; (4) cache hygiene — advisory + confirm-before-switch hook / advisory / none → tier-1 instruction, tier 2 where a host has a pre-model-switch hook (fact 0003: `PreModelSwitch`); (5) compaction — at task boundaries / host automatic / fresh session per task → tier-1 instruction.
Do: write `src/packs/context/pack.json` (`family: harness`, `components: [4]`), adopt it here with the recommended answers, re-run `apply`.
Done-when: the generic conditions above; `go-getter check` fails in a test where `AGENTS.md` exceeds the cap.

### 5.2 Pack `orchestration` (component 10) — [x]
Result: `src/packs/orchestration/pack.json`, adopted here as decisions 0038–0044; roles live in the roster decision's `go-getter.roles` (access overrides and contract text in the reviewer, handoff and escalation decisions) and `apply` compiles them via `compiler/src/agents.mjs` (stale generated agent files are pruned); `go-getter worktree new|list|clean` in `compiler/src/worktree.mjs` (`new` enforces isolation, location and the concurrency limit; `clean` keeps new, dirty and unmerged worktrees). Renderer templates may now carry their own `go-getter` frontmatter data. Unverified: Gemini CLI and Copilot read-only tool names.
Context: decisions 0014, 0028. Questions: (1) roster — planner, explorer, implementer, reviewer, tester / implementer + reviewer / none; (2) reviewer — read-only / trivial fixes / full write; (3) isolation — worktree per task / branches in one tree / none; (4) worktree location — `../<repo>-wt/<slug>` / `.worktrees/` (gitignored) / host default; (5) max concurrent agents — text, `pattern: ^[1-9][0-9]*$`, default 3; (6) escalation to a human — blocked, irreversible or guardrail denial / only when blocked / also before every commit; (7) handoff — brief → result → evidence / free-form / structured JSON. No path-claims question (owner decision 0028). Outputs: decisions; role definitions as `files` under `src`-independent neutral templates rendered into each host's agent format by `apply` (per capabilities: `.claude/agents/*.md`, `.codex/agents/*.toml`, `.opencode/agents/*.md`, `.cursor/agents/*.md`, `.gemini/agents/*.md`, `.github/agents/*.agent.md`), each with its task class (used by 5.6) and the reviewer's tool restriction where the host supports tool lists; a `go-getter worktree new|list|clean` command implementing (3)–(4).
Do: extend `apply` to emit agent definitions from adopted role decisions (neutral role data under `go-getter.roles` in the roster decision); write the pack; adopt it here.
Done-when: generic conditions; `apply --hosts all` on a fixture emits one agent file per role per host in the right format; a `node:test` exercises `worktree new|list|clean` in a temp git repo.

### 5.3 Pack `governance` (component 7) — [x]
Result: `src/packs/governance/pack.json`, adopted here as decisions 0045–0050 (restricted paths: the standard env and key patterns plus the runner state directory). `compiler/src/routing/eligibility.mjs` (pure) and `registry.mjs` (models from facts carrying `go-getter.models`, policy from the decisions); a follow-up `provider` question asks which provider only for the single-provider answer; `apply` switches off prompt logging via the capability key `telemetry.promptLogOff` (checked by `builtin:prompt-logging-off`); the coverage report reads `hook+ci` where a host blocks in-host and CI checks too. Where the hosts rule is used: only the prompt-logging scope and a tier-1 guardrail.
Context: decisions 0018, 0029; guardrail `routing-governance-before-cost`. Questions: (1) restricted paths — list, `detect: sensitivePaths`, default adds `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`; (2) enforcement — hook block + never committed / never committed only / advisory → guardrail with tier 2 `builtin:deny-path paths=<list>` and tier 3 the same builtin; (3) internal data → approved cloud providers on paid no-training terms / single provider / local only → model registry under `go-getter.model-registry` built from facts 0011–0014; (4) confidential requires ZDR — no (offered) / yes / no confidential class; (5) prompt logging — disable everywhere / only with restricted data / host defaults → `apply` sets e.g. Gemini `telemetry.logPrompts: false`; (6) hosts near restricted data — blocking-hook hosts with coverage flags / all / only OS-sandbox hosts. Add `compiler/src/routing/eligibility.mjs` (pure: data class + registry → eligible models).
Do: write the pack, eligibility module and tests, `apply` support for (5); adopt it here (this repo's restricted paths: `.env*`, `.go-getter/state/`).
Done-when: generic conditions; `npm run test:routing` contains eligibility tests (ineligible model never returned; empty set → human); the deny-path hook blocks a read of `.env` in a hook-runtime test; coverage shows per-host DLP tier.

### 5.4 Pack `telemetry` (component 12) — [x]
Result: `src/packs/telemetry/pack.json`, adopted here as decisions 0051–0053 (retention and endpoint are conditional text questions); `compiler/src/telemetry/{schema,record}.mjs`, `go-getter telemetry summary`, and `go-getter hook` records session-start and pre-tool events (fact 0022). Not done: `apply` does not write host OpenTelemetry settings for the host-otel and OTLP answers; token and cost fields wait for the route and verify helpers (5.5, 5.6).
Context: decisions 0017, 0030; guardrail `telemetry-records-metadata-only`. Questions: (1) recording — metadata log / host OTel only / off; (2) retention days — text, `pattern: ^[1-9][0-9]*$`, default 30; (3) export — none / OTLP endpoint (text). Implement `compiler/src/telemetry/schema.mjs` (allowed fields only), a recorder used by `go-getter hook` events and the route/verify helpers, pruning on write, `go-getter telemetry summary`.
Done-when: generic conditions; `npm run test:telemetry` rejects a record carrying a content field and prunes lines older than the retention.

### 5.5 Pack `verification-gate` (component 6) — [x]
Result: `src/packs/verification-gate/pack.json`, adopted here as decisions 0054–0059 and guardrail `verification-gate-blocks-done` (tier 2 stop hook); `compiler/src/verify.mjs` + `go-getter verify --class`; `go-getter hook stop` bounded per session by `go-getter.max-escalations` (default 2 until 5.6 adopts the answer) and `apply` installs the stop hook where the host can block one (fact 0023). Unverified: the Codex `Stop` entry shape and Cursor's `followup_message` field.
Context: decision 0031. Questions: (1) implement/debug checks — detected test + lint + typecheck / tests only / affected tests (text answers prefilled from `{{detect.commands.*}}`); (2) review bar — reviewer verdict / verdict + conform / none; (3) gate — block "done" via stop hooks / report only. Implement `go-getter verify --class <c>` (runs the class's commands, records to telemetry) and a `stop` hook event in the shared runtime (decision 0025) that blocks completion while checks fail, bounded by the escalation limit.
Done-when: generic conditions; a test runs `verify` on a fixture with one passing and one failing check and asserts exit codes and telemetry records; the stop hook blocks on Claude Code-format input and allows after a pass.

### 5.6 Pack `cost-routing` (component 11) — [ ]
Context: decisions 0016, 0020, 0032; guardrails `routing-uses-total-step-cost`, `routing-escalation-bounded`, `routing-governance-before-cost`; facts 0011–0014 carry `go-getter.models` price lists. Questions: (1) classes — explore, plan, implement, review, debug / fast-strong / per-role; (2) starting tiers — balanced / quality-first / cost-first; (3) max escalations — text, default 2; (4) headless spend cap USD — text, default 5; (5) cache TTL — 1h main + 5m subagents / 5m everywhere / host defaults. Implement `compiler/src/routing/cost.mjs` (expected total step cost = input by cache state + output + handoff + P(fail) × next-tier cost) and `compiler/src/routing/policy.mjs`; `go-getter route` helper and the pre-delegation router hook per decision 0020 (rewrite the delegated model on Claude Code, Codex, Cursor; `BeforeModel` on Gemini CLI; advisory elsewhere); `apply` writes per-role model/effort into 5.2's agent files, cache TTL settings (e.g. `promptCacheTtl`, `subagentPromptCacheTtl`) and spend caps for headless invocations.
Done-when: generic conditions; `npm run test:routing` includes: a warm-cache larger model beating a cold-cache cheaper one; a delegation rejected because handoff cost exceeds the saving; an ineligible cheap model never chosen; escalation stopping at the bound. Remove both routing entries from "Known enforcement debt".

## Phase 6 — Evals and release

### 6.1 Behavior evals — [ ]
Context: 0013 layer 3; kms's `evals/` and `evals/providers/kilo-runner.sh` are the model.
Do: `evals/` with fixture repos (Node, Python, empty, one with sensitive paths) and promptfoo cases per pack running `init` with scripted answers, asserting artifacts exist, frontmatter valid, INDEX rows updated, no host-specific text in neutral output. Add one routing case comparing total cost on a fixed fixture task with `cost-routing` on vs off at equal verification pass rate. `npm run eval`; `.github/workflows/eval.yml` (manual dispatch + called by release). Resolve the auth open question first; if a secret is needed, stop and ask the owner. `promptfoo` only in `devDependencies`.
Done-when: `npm run eval` passes locally on at least one host; the `eval` workflow is green on GitHub; `npm run check:deps` exits 0.

### 6.2 Release machinery — [ ]
Do: `.github/workflows/release.yml` with `needs: [test, golden, eval]` (guardrail `release-requires-passing-gate`) plus `npm run check:self-adoption`; version sync so every generated manifest takes its version from `package.json`; `CHANGELOG.md` via `kms:changelog`; `INSTALLING.md` per host (from phase 1 facts); fuller `README.md` including the harness coverage table.
Done-when: a dry run of the release workflow on a branch passes all gate jobs; `INSTALLING.md` has one section per host; every generated manifest version equals `package.json`'s.

### 6.3 Install smoke test per host — [ ]
Do: on each of the six hosts, install from the public repo per `INSTALLING.md`, run `init` for one pack on a scratch repo, confirm artifacts and enforcement files appear. File a GitHub issue per defect.
Done-when: a six-row table (host / installed / init works / defects) is in the PR description with no unexplained failures.

### 6.4 Tag v0.1.0 — [ ]
**Outward-facing: requires the owner's explicit go-ahead.**
Do: merge the release PR, tag `v0.1.0`, create the GitHub release from the changelog.
Done-when: `gh release view v0.1.0 -R vivantel/go-getter` succeeds; the release workflow run for the tag is green.

---

## Phase 7 — Close-out

### 7.1 Re-evaluate the roadmap — [ ]
Context: decision 0004 expires when v0.1.0 ships.
Do: run `/kms:lint` and `/kms:conform`; review the post-v0.1 order with the owner; write `docs/plans/v0.2-calibration-observability.md` (routing calibration 0017, full observability, HITL gates, checkpointing); if the order changes, supersede 0004.
Done-when: lint and conform report no errors; the v0.2 plan exists; 0004 is confirmed in a PR note or `superseded` with valid `superseded-by`.

### 7.2 Propose the `go-getter:` key upstream — [ ]
**Outward-facing: confirm with the owner first.**
Do: open an issue in `vivantel/kms` proposing tolerance of (or a standard for) tool-namespaced frontmatter, citing decision 0007.
Done-when: the issue URL is recorded in the 7.1 PR description.

### 7.3 Consider a second dogfood repo — [ ]
Do: ask the owner whether to adopt go-getter in another vivantel repo (0010 deferred this).
Done-when: the answer is recorded in the 7.1 PR description; if yes, a follow-up plan exists.
