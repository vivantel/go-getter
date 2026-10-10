# Decisions index (CSV)

id,title,tags,status
0001-go-getter-product-scope-and-name,"go-getter sets up the agent harness and SDLC practices for AI-driven development with minimal effort","positioning, harness, roadmap",active
0002-six-host-agents-from-v0-1,"v0.1 supports seven host agents - Claude Code, Codex, Kilo, OpenCode, Cursor, Gemini CLI, GitHub Copilot","host-agents, agent-agnostic, packaging",active
0003-guided-interview-only-setup,"Project setup is a guided interview with recommended defaults, not auto-applied presets","interview, positioning, configuration",active
0005-neutral-source-compiler-architecture,"Author content once in a neutral source and compile it to each host agent's native files","architecture, compiler, generated-files, agent-agnostic",active
0008-declarative-practice-packs,"Practice areas are declarative packs in two families - harness packs and SDLC packs - driven by one init skill","practice-packs, interview, architecture, harness",active
0009-tiered-enforcement-git-ci-floor,"Rules are enforced in tiers, with host-independent git hooks and CI as the floor","enforcement, git-hooks, ci, hooks",active
0010-self-hosting-ratchet,"go-getter dogfoods itself from commit 0 through a self-hosting ratchet","dogfooding, ci, roadmap",active
0012-public-mit-repo,"The repo is public on GitHub as vivantel/go-getter under the MIT license","licensing, packaging, security",active
0013-layered-verification-gate,"go-getter is verified in three layers - unit, golden output, behavior evals","verification, eval, ci",active
0014-agent-roles-compiled-to-native-agents,"Agent roles are declared once and compiled to native host agents' subagents with a shared handoff contract","agent-roles, compiler, practice-packs, harness",active
0015-configure-host-agent-harness-not-own-runtime,"go-getter configures and complements host agents' harness; it does not run its own agent runtime","harness, host-agents, architecture, positioning",active
0016-quality-gated-cache-aware-model-routing,"Model routing is a quality-gated cascade that minimizes expected total step cost, cache effects included","model-routing, cost, harness, verification",active
0017-routing-calibration-from-verification-and-telemetry,"Routing quality bars and tiers are calibrated from verification signals and outcome telemetry","model-routing, observability, verification, cost",active
0018-data-classes-constrain-routing-with-tiered-dlp,"Data classes are hard constraints on model eligibility, enforced with tiered DLP","governance, security, model-routing, harness",active
0019-node-prerequisite-oldest-supported-lts,"go-getter tooling is zero-dependency Node.js, requiring the oldest supported LTS, degrading gracefully where Node is absent","nodejs, tooling, compiler, enforcement",active
0020-routing-runtime-mechanism,"Routing runs as compiled per-role defaults plus a delegation-time router hook, with hook-gated bounded escalation","model-routing, hooks, enforcement, cost",active
0021-neutral-source-and-output-layout,"Neutral source, compiler and per-host output layout","architecture, compiler, generated-files, packaging",active
0022-pack-schema-and-enforcement-run-grammar,"Practice packs are JSON files with questions, options and per-answer artifact templates; enforcement runs use a builtin-or-command grammar","practice-packs, interview, enforcement, configuration",active
0023-cli-distributed-via-npx-from-github,"Skills invoke the go-getter CLI through npx from the GitHub repository","packaging, nodejs, tooling",active
0024-dogfood-workflow-with-own-plugin,"This repo runs its knowledge-base workflow through its own go-getter plugin, with capture, conform and attribute on every PR","dogfooding, knowledge-management, git-hooks",active
0025-shared-tier-2-hook-runtime,"Every host's hooks call one shared go-getter hook runtime instead of host-specific rule logic","enforcement, hooks, architecture",active
0026-typed-pack-answers-and-detect-values,"Pack questions can take typed free-text and list answers, and templates can use detected values","practice-packs, interview, configuration",active
0027-context-pack-defaults,"The context pack recommends a 150-line instruction cap, skills on demand, cost-model delegation, cache hygiene and compaction at task boundaries","practice-packs, harness, cost",active
0028-orchestration-pack-defaults,"The orchestration pack recommends five roles, a read-only reviewer, worktree isolation without path claims, and a brief-result-evidence handoff","practice-packs, agent-roles, harness",active
0029-governance-pack-defaults,"The governance pack recommends blocking restricted paths, paid no-training cloud providers, optional ZDR and no prompt logging","practice-packs, governance, security",active
0030-telemetry-pack-defaults,"The telemetry pack recommends a local metadata log kept 30 days with no export","practice-packs, observability, governance",active
0031-verification-gate-pack-defaults,"The verification-gate pack recommends detected test, lint and typecheck checks, a reviewer verdict, and blocking completion","practice-packs, verification, harness",active
0032-cost-routing-pack-defaults,"The cost-routing pack recommends five task classes, balanced tiers, two escalations, a $5 headless cap and 1h main-session cache","practice-packs, model-routing, cost",active
0033-instruction-file-cap,"The always-loaded instruction file is capped at 150 lines","practice-packs, harness, cost",active
0034-procedure-delivery,"Detailed procedures live in skills loaded on demand","practice-packs, harness, cost",active
0035-noisy-work-placement,"Noisy work is delegated only when the cost model says the handoff is cheaper","practice-packs, harness, cost",active
0036-cache-hygiene,"No mid-task model, effort or instruction-file change; switches are confirmed","practice-packs, harness, cost",active
0037-compaction-timing,"Context is compacted at task boundaries","practice-packs, harness, cost",active
0038-agent-roster,"Work is delegated to planner, explorer, implementer, reviewer and tester agents","practice-packs, agent-roles, harness",active
0039-reviewer-access,"The reviewer reports findings and changes nothing","practice-packs, agent-roles, harness",active
0040-parallel-isolation,"Each parallel task runs in its own git worktree","practice-packs, agent-roles, harness",active
0041-worktree-location,"Task worktrees live next to the repository","practice-packs, agent-roles, harness",active
0042-max-concurrent-agents,"At most 3 agents run at once","practice-packs, agent-roles, harness",active
0043-human-escalation,"Agents hand over to a human when blocked, before irreversible or outward-facing actions, and on a guardrail denial","practice-packs, agent-roles, harness",active
0044-handoff-contract,"Handoffs are a brief in, then a result and evidence out","practice-packs, agent-roles, harness",active
0045-restricted-paths,"Restricted data lives at a declared list of paths","practice-packs, governance, security",active
0046-restricted-paths-enforcement,"Restricted paths are blocked in the host and never committed","practice-packs, governance, enforcement",active
0047-internal-data-routing,"Internal data goes only to approved cloud providers on paid no-training terms","practice-packs, governance, model-routing",active
0048-confidential-data-routing,"Confidential data may go wherever internal data may","practice-packs, governance, security",active
0049-prompt-logging,"Host prompt logging is disabled on every host","practice-packs, governance, observability",active
0050-restricted-data-hosts,"Restricted data is handled only on hosts with a blocking pre-tool hook","practice-packs, governance, security",active
0051-telemetry-recording,"Each routed step is recorded as one metadata JSON line in the local state directory","practice-packs, observability, harness",active
0052-telemetry-retention,"The metadata log keeps 30 days","practice-packs, observability, harness",active
0053-telemetry-export,"Telemetry is not exported","practice-packs, observability, harness",active
0054-verification-checks,"Implement and debug steps pass the project's test, lint and typecheck commands","practice-packs, verification, harness",active
0055-verification-test-command,"The verification test command is ""npm test""","practice-packs, verification, harness",active
0056-verification-lint-command,"The verification lint command is """"","practice-packs, verification, harness",active
0057-verification-typecheck-command,"The verification typecheck command is """"","practice-packs, verification, harness",active
0058-verification-review-bar,"Review steps pass a reviewer-agent verdict","practice-packs, verification, harness",active
0059-verification-gate,"""Done"" is blocked while the verification checks fail","practice-packs, verification, harness",active
0060-routing-classes,"Routing distinguishes explore, plan, implement, review and debug","practice-packs, model-routing, cost",active
0061-routing-start-tiers,"Classes start at balanced tiers and the lowest effort they allow","practice-packs, model-routing, cost",active
0062-routing-max-escalations,"A failed step escalates at most 2 times, then a human decides","practice-packs, model-routing, cost",active
0063-routing-spend-cap,"Headless runs are capped at 5 USD where the host has a cap","practice-packs, model-routing, cost",active
0064-routing-cache-ttl,"The prompt cache lives one hour in the main session and five minutes in subagents","practice-packs, model-routing, cost",active
0065-behavior-evals-are-scripted-and-keyless,"The first behavior evals run init with scripted answers, with no model and no API key","verification, eval, ci",active
0066-own-the-knowledge-base-tooling,"go-getter owns its knowledge-base tooling and artifact format; nothing is vendored or synced","knowledge-base, configuration, vendoring, packaging",active
0067-accepted-artifacts-may-be-corrected-in-place,"Accepted decisions and facts may be corrected in place for wording and factual errors; a change of meaning is superseded","knowledge-management",active
0068-post-v0.1-milestone-sequence,"v0.2 hardens the agent core in three waves; git workflow and spec workflow follow in v0.3","milestones, roadmap, harness",active
0069-plan-steps-carry-class-and-dependencies,"Plan steps declare a task class, dependencies and a check, and go-getter offers the next steps as numbered options","roadmap, model-routing, harness",active
0070-watcher-noise-is-a-project-policy,"Watcher noise is a project policy, quiet by default, enforced by a wrapper rather than by the host","harness, cost, hooks, practice-packs",active
0071-verification-checks-run-locally-or-in-ci,"Each verification check runs locally, in CI or both, so thin dev machines run only the cheap ones","verification, ci, harness, practice-packs",active
0072-restricted-paths-have-access-modes,"Restricted paths have access modes deny, use and sink, enforced in layers that state where they stop","governance, security, enforcement, hooks",active
0075-spec-tools-are-detected-and-tolerated,"Spec and change tools such as OpenSpec are detected and tolerated, not wrapped by a pack","roadmap, tooling, practice-packs",active
0076-watcher-noise,"Watchers are quiet","practice-packs, harness, cost",draft
0077-restricted-path-modes,"Restricted paths have an access mode, deny unless listed","practice-packs, governance, security",active
0078-verification-format-command,"The verification format command is """"","practice-packs, verification, harness",active
0079-verification-static-analysis-command,"The verification static-analysis command is """"","practice-packs, verification, harness",active
0080-verification-build-command,"The verification build command is """"","practice-packs, verification, harness",active
0081-verification-unit-command,"The verification unit command is """"","practice-packs, verification, harness",active
0082-verification-integration-command,"The verification integration command is """"","practice-packs, verification, harness",active
0083-verification-e2e-command,"The verification e2e command is """"","practice-packs, verification, harness",active
0084-verification-machine-profile,"Cheap checks run locally, slow checks only in CI (thin machine profile)","practice-packs, verification, harness, ci",active
0085-pack-questions-added-later-declare-since,"A pack question added in a later version declares `since` and falls back to its default or recommended option","practice-packs, interview, configuration",draft
0086-calibration-proposals-take-effect-when-activated,"Routing calibration proposals are draft decisions whose data routing reads only once a human activates them","model-routing, cost, observability",draft
0087-host-otel-settings-only-where-project-config-accepts-them,"apply writes host OpenTelemetry settings only where a host's project config accepts them, and fills token and cost fields only from documented hook data","observability, cost, enforcement",draft
0089-apply-records-ownership-in-a-manifest,"apply records what it owns in .go-getter/manifest.json and never overwrites or removes a modified owned item without --force","generated-files, enforcement, configuration",active
0090-update-and-remove-work-from-the-manifest,"go-getter update re-renders from recorded answers, apply --remove undoes generated output outside docs, and drift is surfaced at session start and by apply --check","generated-files, configuration, dogfooding",active
0091-decisions-activate-on-acceptance-or-adoption,"A decision stays draft until the owner accepts it or it is adopted, whichever comes first; committing it is not adoption","knowledge-management, dogfooding",active
0092-pack-rendered-drafts-count-as-adopted,"update and reconfigure treat pack-rendered artifacts that are still draft as adopted","generated-files, configuration",active
0093-init-skill-carries-its-own-cli,"The go-getter-init skill carries a copy of the CLI and runs it from its own directory, not through npx","packaging, nodejs, tooling, generated-files",draft
0094-gated-actions-need-human-approval,"Irreversible and outward-facing commands need a human, through native ask rules where they can be tested and a hook hand-over elsewhere","harness, hooks, enforcement, practice-packs",active
0095-gated-actions,"Gated actions need a human","practice-packs, hooks, guardrail",active
0096-enforcement-runs-a-vendored-cli,"apply copies the CLI into the project and the generated runner runs that copy before npx","packaging, nodejs, generated-files, enforcement",active
0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions,"A checkpoint is a hidden git ref taken by the pre-tool hook before a gated action, and the last 10 are kept","practice-packs, harness, hooks, enforcement",active
