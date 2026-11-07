# Decisions index (CSV)

id,title,tags,status
0002-six-host-agents-from-v0-1,"v0.1 supports seven host agents - Claude Code, Codex, Kilo, OpenCode, Cursor, Gemini CLI, GitHub Copilot","host-agents, agent-agnostic, packaging",active
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
0042-max-concurrent-agents,"At most 3 agents run at once","practice-packs, agent-roles, harness",superseded
0043-human-escalation,"Agents hand over to a human when blocked, before irreversible or outward-facing actions, and on a guardrail denial","practice-packs, agent-roles, harness",active
0044-handoff-contract,"Handoffs are a brief in, then a result and evidence out","practice-packs, agent-roles, harness",active
0045-restricted-paths,"Restricted data lives at a declared list of paths","practice-packs, governance, security",active
0046-restricted-paths-enforcement,"Restricted paths are blocked in the host and never committed","practice-packs, governance, enforcement",active
0047-internal-data-routing,"Internal data goes only to approved cloud providers on paid no-training terms","practice-packs, governance, model-routing",active
0048-confidential-data-routing,"Confidential data may go wherever internal data may","practice-packs, governance, security",active
0049-prompt-logging,"Host prompt logging is disabled on every host","practice-packs, governance, observability",active
0050-restricted-data-hosts,"Restricted data is handled only on hosts with a blocking pre-tool hook","practice-packs, governance, security",active
0051-telemetry-recording,"Each routed step is recorded as one metadata JSON line in the local state directory","practice-packs, observability, harness",active
0052-telemetry-retention,"The metadata log keeps 30 days","practice-packs, observability, harness",superseded
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
0069-plan-steps-carry-class-and-dependencies,"Plan steps declare a task class, dependencies and a check, and go-getter offers the next steps as numbered options","roadmap, model-routing, harness",active
0070-watcher-noise-is-a-project-policy,"Watcher noise is a project policy, quiet by default, enforced by a wrapper rather than by the host","harness, cost, hooks, practice-packs",active
0071-verification-checks-run-locally-or-in-ci,"Each verification check runs locally, in CI or both, so thin dev machines run only the cheap ones","verification, ci, harness, practice-packs",active
0072-restricted-paths-have-access-modes,"Restricted paths have access modes deny, use and sink, enforced in layers that state where they stop","governance, security, enforcement, hooks",active
0075-spec-tools-are-detected-and-tolerated,"Spec and change tools such as OpenSpec are detected and tolerated, not wrapped by a pack","roadmap, tooling, practice-packs",active
0076-watcher-noise,"Watchers are quiet","practice-packs, harness, cost",active
0077-restricted-path-modes,"Restricted paths have an access mode, deny unless listed","practice-packs, governance, security",active
0078-verification-format-command,"The verification format command is """"","practice-packs, verification, harness",active
0079-verification-static-analysis-command,"The verification static-analysis command is """"","practice-packs, verification, harness",active
0080-verification-build-command,"The verification build command is """"","practice-packs, verification, harness",active
0081-verification-unit-command,"The verification unit command is """"","practice-packs, verification, harness",active
0082-verification-integration-command,"The verification integration command is """"","practice-packs, verification, harness",active
0083-verification-e2e-command,"The verification e2e command is """"","practice-packs, verification, harness",active
0084-verification-machine-profile,"Cheap checks run locally, slow checks only in CI (thin machine profile)","practice-packs, verification, harness, ci",active
0085-pack-questions-added-later-declare-since,"A pack question added in a later version declares `since` and falls back to its default or recommended option","practice-packs, interview, configuration",active
0086-calibration-proposals-take-effect-when-activated,"Routing calibration proposals are draft decisions whose data routing reads only once a human activates them","model-routing, cost, observability",active
0087-host-otel-settings-only-where-project-config-accepts-them,"apply writes host OpenTelemetry settings only where a host's project config accepts them, and fills token and cost fields only from documented hook data","observability, cost, enforcement",active
0089-apply-records-ownership-in-a-manifest,"apply records what it owns in .go-getter/manifest.json and never overwrites or removes a modified owned item without --force","generated-files, enforcement, configuration",active
0090-update-and-remove-work-from-the-manifest,"go-getter update re-renders from recorded answers, apply --remove undoes generated output outside docs, and drift is surfaced at session start and by apply --check","generated-files, configuration, dogfooding",active
0091-decisions-activate-on-acceptance-or-adoption,"A decision stays draft until the owner accepts it or it is adopted, whichever comes first; committing it is not adoption","knowledge-management, dogfooding",active
0092-pack-rendered-drafts-count-as-adopted,"update and reconfigure treat pack-rendered artifacts that are still draft as adopted","generated-files, configuration",active
0093-init-skill-carries-its-own-cli,"The go-getter-init skill carries a copy of the CLI and runs it from its own directory, not through npx","packaging, nodejs, tooling, generated-files",active
0094-gated-actions-need-human-approval,"Irreversible and outward-facing commands need a human, through native ask rules where they can be tested and a hook hand-over elsewhere","harness, hooks, enforcement, practice-packs",active
0095-gated-actions,"Gated actions need a human","practice-packs, hooks, guardrail",active
0096-enforcement-runs-a-vendored-cli,"apply copies the CLI into the project and the generated runner runs that copy before npx","packaging, nodejs, generated-files, enforcement",active
0097-checkpoints-are-hidden-git-refs-taken-before-gated-actions,"A checkpoint is a hidden git ref taken by the pre-tool hook before a gated action, and the last 10 are kept","practice-packs, harness, hooks, enforcement",active
0098-checkpoint-before-gated-action,"Work is checkpointed before a gated action","practice-packs, hooks, guardrail",active
0099-git-workflow-pack-covers-branches-commits-and-prs,"The git-workflow pack covers branches, commits and pull requests, and one change is one branch and one PR","practice-packs, git-hooks, milestones",active
0100-branch-names,"Branches are named ^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$","practice-packs, git-hooks, guardrail",active
0101-change-unit,"One change is one branch and one pull request","practice-packs, git-hooks, guardrail",active
0102-default-branch,"The default branch takes no direct work","practice-packs, git-hooks, guardrail",active
0103-refs-trailers,"Refs trailers are encouraged","practice-packs, git-hooks, guardrail",active
0105-behavior-layer-without-generated-runbooks,"Behavior is a layer over the four artifact types, with no generated runbook form","knowledge-management, roadmap",active
0106-scanning-and-masking-share-one-pattern-library,"Secret scanning and PII masking share one pattern library, scan added lines only, and mask with per-session pseudonyms kept as salted hashes","governance, security, enforcement",active
0107-secret-run-and-put-are-limited-to-approved-commands-and-sources,"secret run runs only commands approved for that secret, secret put takes stdin or a declared command, and sandbox snippets are printed, never written","governance, security, enforcement",active
0108-secret-scan,"Secrets in added lines are scanned before a commit and a push","practice-packs, governance, security",active
0109-scan-allow-paths,"The secret scan skips a declared list of paths","practice-packs, governance, security",active
0110-checkpoint-trigger-gated-action,"A checkpoint is taken before a gated command","practice-packs, hooks",active
0111-checkpoint-retention,"The 10 newest checkpoints are kept","practice-packs, hooks",active
0112-gated-extra-patterns,"Project-specific commands that also need a human are listed","practice-packs, hooks",active
0113-pii-masking,"Personal data in tool output is masked with per-session pseudonyms","practice-packs, governance, security",active
0114-pii-extra,"The locale-bound types masked in tool output are listed","practice-packs, governance, security",active
0115-use-commands,"The commands approved to receive a use path are listed","practice-packs, governance, security",active
0116-sink-sources,"The sources allowed to fill a sink path are listed","practice-packs, governance, security",active
0117-tracker-backed-plans,"An optional tracker pack makes issues the source of truth for plan steps, with writes through go-getter's own verbs only","roadmap, practice-packs, tooling",active
0118-extension-architecture-core-and-edges,"go-getter keeps a small core and moves the open-ended edges behind interfaces that can later become helper processes","architecture, roadmap, compiler",active
0119-helper-contract-v0,"A helper is a pinned executable behind a JSON contract; its output is untrusted data and MCP is only a possible backend","architecture, roadmap, enforcement",active
0123-plans-in-github,"Plan steps live in GitHub Issues","practice-packs, roadmap",active
0124-tracker-writes,"go-getter may write to the tracker with a human approving each write","practice-packs, roadmap",superseded
0126-secret-use-is-approved-once-per-user-and-bound-to-code,"A command's use of a secret file is approved once per user, bound to its code, and recognised by what it runs","governance, security, enforcement, hooks",active
0127-gated-free-commands,"Outward-facing commands that run without asking are listed","practice-packs, hooks",superseded
0129-pack-boundaries-neutral-ids-and-a-retrieval-pack,"Each concern has one pack, provider ids are neutral, and memory beyond the knowledge base is a provider-neutral retrieval pack","practice-packs, roadmap, architecture",active
0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops,"An autonomous run is a plan range the operator starts, with approve-once for outward commands, preconditions checked at use and bounded stops","hooks, enforcement, roadmap, practice-packs",active
0131-pack-boundaries-then-the-run-approvals-then-mcp,"Work order: pack boundaries, run record and approve-once, MCP governance, go-getter as an MCP server, then helpers","milestones, roadmap, harness",active
0132-governance-splits-into-three-packs-and-existing-adoptions-are-relabelled,"governance splits into restricted-data, sanitization and data-policy, and update relabels existing adoptions instead of asking again","practice-packs, compiler, configuration",active
0133-verification-coverage-command,"The verification coverage command is """"","practice-packs, verification, harness",active
0134-verification-coverage-bar,"Coverage must meet what the coverage command enforces","practice-packs, verification, harness",active
0135-gated-run-grants,"Outward commands a run or a remembered approval may allow are listed","practice-packs, hooks",active
0136-host-adapter-interface,"A host adapter answers nine questions as plain data and shares the rest","architecture, compiler, host-agents",draft
0137-a-run-may-be-started-by-confirmation-at-the-host-prompt,"A run may be started by the agent when a person confirms it at the host prompt","hooks, enforcement, roadmap",draft
0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned,"MCP servers are allowlisted by name; their tool calls are classed read or write, approved once, scanned on the way out and masked on the way back","hooks, enforcement, roadmap, practice-packs",active
0139-go-getter-serves-adopted-pack-verbs-as-read-only-mcp-tools-over-stdio,"go-getter serves the verbs of the packs a project adopted as read-only MCP tools over stdio, opt-in","architecture, roadmap, hooks, compiler",active
0140-foreign-packs-and-helpers-are-vendored-pinned-and-held-to-the-cores-budgets,"Foreign packs and helpers are vendored by digest, trusted through the pull request, and held to budgets the core enforces","architecture, roadmap, practice-packs, cost",active
0141-mcp-no-project-policy,"No project list of MCP servers","practice-packs, hooks",draft
0142-the-helper-protocol-waits-for-a-real-need,"The helper protocol waits for a second implementation or an external request; our own trust steps do not trigger it","architecture, roadmap",active
0143-mcp-arguments-scanned,"MCP call arguments are scanned for secrets","practice-packs, hooks",draft
0144-a-spend-cap-on-a-host-without-a-cost-source-warns-and-starts,"A spend cap on a host with no cost source is reported, not refused; sources are read, never installed","cost, enforcement, host-agents",active
0145-retrieval-tools-follow-a-go-getter-contract,"A retrieval tool follows a go-getter contract (no hooks or MCP entry of its own, go-getter's ignore input, a warm local query daemon); the pack waits for virage to conform","practice-packs, hooks, security",active
0146-retrieval-contract-v0,"Retrieval contract v0 is three files (index policy, declaration, endpoint discovery) and a loopback JSON endpoint the tool owns","practice-packs, hooks, security",active
0147-the-interview-is-a-pure-read-only-cli-verb-and-a-read-mcp-tool,"The interview's question logic is a pure read-only verb, `interview next|validate`, which the active agent renders; an MCP wrapper serves it to adopted projects only","interview, practice-packs, compiler, hooks",active
0148-update-may-take-recommended-defaults-for-unrecorded-answers-after-a-dry-run,"`update` may take recommended defaults for answers no artifact records, only after a dry run that lists each one, and renders them as draft","interview, configuration, generated-files, enforcement",active
0149-an-answers-file-may-seed-an-interview,"An answers file from another project or a profile may seed an interview as untrusted data, validated and shown before it is rendered","interview, practice-packs, security",active
0150-a-pack-may-offer-profiles-that-expand-into-visible-answers,"A pack may offer profiles, named answer bundles for one topic that expand into per-question answers; setup stays a guided interview","interview, practice-packs, configuration, positioning",active
0151-a-pack-question-may-be-advanced-and-then-takes-its-recommended-answer,"A pack question may be tiered advanced; the interview then takes its recommended answer, renders its decision and lists it in the dry run","interview, practice-packs, configuration",active
0152-apply-and-doctor-print-allow-rules-for-commands-a-host-classifier-may-refuse,"go-getter prints the allow rules a person may add for commands the project frees or approves, and never writes them","hooks, claude-code, enforcement, host-agents",draft
0153-the-claude-code-plugin-puts-a-go-getter-command-on-the-bash-path,"The Claude Code plugin ships bin/go-getter so a skill's bare go-getter command runs the bundled CLI","packaging, claude-code, tooling, generated-files",draft
0154-throughput-is-measured-in-human-minutes-per-merged-outcome,"Throughput is measured in human minutes per merged outcome, with a 5-10x floor and a 50x stretch","roadmap, dogfooding, cost",active
0155-human-attention-goes-to-plan-approval-triggers-and-batched-releases,"Human attention goes to plan approval, four ask-triggers and batched releases; agents merge on green and log defaulted decisions","hooks, roadmap, agent-roles",active
0156-up-to-10-agents-run-at-once-each-in-its-own-worktree,"Up to 10 agents run at once, each in its own worktree on its own branch","practice-packs, agent-roles, harness",active
0157-routine-actions-run-through-a-ship-verb-and-raw-equivalents-are-redirected,"Routine actions run through a deterministic ship verb, and raw git and gh equivalents are redirected to it","hooks, enforcement, dogfooding",superseded
0158-merge-requires-a-gate-stack-and-a-sampled-human-audit,"An agent merges only after a gate stack passes, and the owner audits a sample of merged PRs","verification, ci, agent-roles",active
0159-a-human-is-asked-only-when-an-action-would-destroy-something-unrecoverable,"A human is asked only when an action would destroy something unrecoverable, judged from the repository's state","positioning, hooks, enforcement, guardrail, roadmap",active
0160-tracker-writes,"go-getter may write to the tracker without asking","practice-packs, roadmap",active
0161-gated-free-commands,"Outward-facing commands that run without asking are listed","practice-packs, hooks",active
0162-gated-free-channels,"Release and publish channels that run without asking are listed","practice-packs, hooks",draft
0163-ship-means-the-whole-way-to-merge-and-pr-is-the-verb-for-stopping-at-the-pull-request,"ship means the whole way to merge, and pr is the verb for stopping at the pull request","hooks, enforcement, dogfooding",active
0164-plan-delivery,"A plan is delivered one pull request per step","practice-packs, git-hooks, guardrail",draft
0165-a-work-unit-is-one-recursive-contract-at-every-level,"A work unit is one recursive contract at every level of product > feature > plan > step; a plan is the default unit of delegation","coordination, roadmap, architecture",active
0166-claims-are-leased-git-refs-and-status-lives-in-the-tracker,"Claims are entries in a per-feature compare-and-swap ledger with expiring leases that name their holder; status lives in the tracker issue, not in a shared file","coordination, roadmap, architecture",active
0167-declared-scope-and-a-merge-queue-prevent-collisions-between-parallel-units,"Declared scope and a merge queue prevent collisions between parallel units, and shared artifacts need no shared counter","coordination, ci, architecture",active
0168-human-asks-are-parked-in-a-routed-queue-and-never-hold-a-worker,"A unit that needs a human is parked in a routed queue and releases its worker; a human's delay never blocks other units","coordination, hooks, agent-roles",active
0169-go-getter-defines-a-pull-protocol-for-workers-and-runs-no-fleet,"go-getter defines a pull protocol for workers and runs no fleet; the agent cap is per worker","coordination, architecture, harness",active
0170-flow-health-metrics-extend-the-throughput-metric,"Flow-health metrics extend the human-minutes headline; a rising rate is a regression to fix before more gates ship","coordination, observability, cost",active
0171-grants-only-narrow-down-the-delegation-tree,"A delegated grant is a subset of its parent's, so authority can only shrink down the tree","coordination, hooks, security",active
0172-validation-is-tiered-by-level-and-the-validator-is-never-the-author,"Validation is tiered by level, strictness rises up the tree, and the validator is never the author","coordination, verification, agent-roles",active
0173-a-unit-has-a-lifecycle-with-retry-quarantine-cancel-and-a-pinned-brief-version,"A unit has a lifecycle with lease reclaim, a retry budget, quarantine, cancel and supersede, and a claim pins the brief version","coordination, roadmap, harness",active
0174-ready-work-is-ordered-by-priority-under-wip-limits-and-status-is-computed-on-read,"Ready work is ordered by priority under WIP limits, new units pass an intake approval, and status is computed on read","coordination, roadmap, observability",active
0175-partial-features-merge-behind-flags-and-flaky-checks-are-quarantined,"Partial features merge behind a flag until accepted, and flaky required checks are quarantined and owned","coordination, ci, verification",active
0176-go-getter-coordinates-humans-and-agents-to-achieve-outcomes-in-any-domain,"go-getter coordinates humans and agents to achieve outcomes in any domain; software delivery is the first fully supported domain","positioning, coordination, roadmap",active
0177-each-part-of-the-framework-owns-one-artifact-and-one-kind-of-decision,"Discover, decompose, deliver, measure and operate each own one artifact and one kind of decision","coordination, roadmap, architecture",active
0178-an-outcome-is-accepted-when-its-meter-meets-its-target-over-a-window-with-attribution,"An outcome is accepted when its meter meets the target over a window and the attribution method holds","coordination, verification, roadmap",active
0179-a-meter-is-a-first-class-instrument-and-a-reading-is-a-unit-any-capable-worker-claims,"A meter is a first-class instrument and a reading is a unit that any capable worker claims","coordination, observability, architecture",active
0180-real-world-effects-are-classed-in-grants-and-delegable-only-inside-a-human-written-cap,"Real-world effects are classed in grants and delegable only inside a human-written cap","coordination, security, guardrail",active
0181-capability-tags-filter-the-units-a-worker-is-offered-and-the-router-chooses-the-model,"Capability tags filter the units a worker is offered, and the router still chooses model and effort","coordination, model-routing, agent-roles",active
0182-the-throughput-steps-are-built-on-the-current-layer-and-migrated-later,"The throughput steps are built on the current layer and migrated to the work layer later","coordination, roadmap",draft
0183-this-repo-enables-its-own-plugin-pinned-to-a-release-tag,"This repo enables its own plugin in project settings, pinned to a release tag by apply","dogfooding, ci, roadmap",active
0185-a-pack-answer-is-data-and-becomes-a-decision-only-when-it-is-a-real-choice,"A pack answer is data and becomes a decision only when it is a real choice","practice-packs, knowledge-base",draft
0186-an-approved-plan-and-the-run-grants-answer-are-the-authority-to-start-a-run,"An approved plan and the run-grants answer are the authority to start a run; starting is free","hooks, enforcement, roadmap",active
0187-a-release-the-user-asks-for-in-the-chat-is-the-approval-to-merge-it,"A release the user asks for in the chat is the approval to merge it; no command is typed","hooks, enforcement, security",active
0188-a-release-request-is-read-from-what-the-user-typed-by-a-small-model-and-bounded-by-code,"A release request is read from what the user typed by a small model and bounded by code, not matched to a phrase","hooks, enforcement, security",active
0189-claim-lease-agent,"The lease of an agent's claim is 60 minutes","practice-packs, agent-roles, harness",draft
0190-claim-lease-ci,"The lease of a CI job's claim is 60 minutes","practice-packs, agent-roles, harness",draft
0191-claim-lease-human,"The lease of a person's claim is 480 minutes","practice-packs, agent-roles, harness",draft
0192-claim-clock-skew,"A lease lapses 5 minutes after its expiry, and a clock that far off the host cannot claim","practice-packs, agent-roles, harness",draft
0193-claim-parent-idle,"A parent unit with live children is flagged idle after 7 days without action","practice-packs, agent-roles, harness",draft
0194-claim-brief-max,"A delegated unit keeps at most 8 KB of brief fields in the claims ledger","practice-packs, agent-roles, harness",draft
0195-work-pick-among,"Workers pick among the first 5 ready work units","practice-packs, agent-roles, harness",draft
0196-work-wip-per-worker,"A worker holds at most max-concurrent work units at once","practice-packs, agent-roles, harness",draft
0197-work-wip-per-feature,"At most none work units of one feature are claimed at once","practice-packs, agent-roles, harness",draft
0198-merge-queue,"The merge queue is off: ship merges through it only when it is on","practice-packs, agent-roles, harness",draft
0199-we-publish-a-position-and-system-paper-and-may-change-go-getter-to-support-it,"We publish a position-and-system paper on go-getter as a deterministic edge, and may change go-getter to support it","research, positioning, roadmap",active
0200-the-paper-commits-to-five-claims-and-labels-the-scaling-claim-as-extrapolation,"The paper commits to five claims and labels the scaling claim as extrapolation","research, positioning, harness, enforcement",active
0201-the-metadata-log-keeps-365-days,"The metadata log keeps 365 days","observability, harness",superseded
0202-telemetry-retention,"The metadata log keeps 365 days","practice-packs, observability, harness",active
0203-plan-class-steps-stop-a-run,"A Class: plan step stops an autonomous run for a person","roadmap, enforcement",active
0204-an-enforcement-entry-may-say-whether-its-check-is-derived,"An enforcement entry may say whether its check is derived from the guardrail or hand-written","enforcement, guardrail, knowledge-base",draft
0206-approval-events-record-class-and-outcome,"Each point where work waits for a person is an approval event with a class from a fixed table and one of three outcomes","observability, hooks",draft
0207-a-meter-may-name-a-command-that-takes-its-reading,"A meter may name a command that takes its reading","coordination, observability, knowledge-base",draft
draft-a7-five-advisory-guardrails-get-derived-checks,"Five advisory-only guardrails get checks derived from their own text, and the rest stay advisory","enforcement, guardrail, research",draft
draft-agents-do-their-own-prep,"An agent does a change's preparation itself and hands a person only gated actions, as questions","coordination, agent-roles, procedural",draft
draft-release-request-survives-merges,"A release request is bound to the version it asks for, not to the default branch head","hooks, enforcement, security",draft
draft-verbs-the-verb-system-is-nouns-actions-and-recipes,"The verb system is a closed set of nouns, atomic noun-action verbs, and recipes that compose them","architecture, compiler, enforcement",draft
