# Decisions index (CSV)

id,title,tags,status
0001-go-getter-product-scope-and-name,"go-getter sets up the agent harness and SDLC practices for AI-driven development with minimal effort","positioning, harness, roadmap",active
0002-six-host-agents-from-v0-1,"v0.1 supports six host agents - Claude Code, Codex, Kilo/OpenCode, Cursor, Gemini CLI, GitHub Copilot","host-agents, agent-agnostic, packaging",active
0003-guided-interview-only-setup,"Project setup is a guided interview with recommended defaults, not auto-applied presets","interview, positioning, configuration",active
0004-milestone-sequence-foundation-then-agent-practices,"v0.1 is foundation plus the agent core incl. routing and governance; git workflow and testing follow","milestones, roadmap, harness",active
0005-neutral-source-compiler-architecture,"Author content once in a neutral source and compile it to each host agent's native files","architecture, compiler, generated-files, agent-agnostic",active
0006-vendor-kms-as-builtin-pack,"kms is vendored into go-getter as a built-in pack, synced from upstream","kms, vendoring, packaging",active
0007-kms-artifacts-as-configuration-source-of-truth,"A project's chosen practices live only as kms artifacts, with machine-readable data under a go-getter frontmatter key","kms, configuration, enforcement",active
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
0024-dogfood-workflow-with-own-plugin,"This repo runs its kms workflow through its own go-getter plugin, with capture, conform and attribute on every PR","dogfooding, knowledge-management, git-hooks",active
0025-shared-tier-2-hook-runtime,"Every host's hooks call one shared go-getter hook runtime instead of host-specific rule logic","enforcement, hooks, architecture",active
