# Guardrails index (CSV)

id,title,tags,status
generated-host-files-not-hand-edited,"Generated host-agent files must never be hand-edited","generated-files, compiler, guardrail",active
guardrails-declare-enforcement,"Every guardrail must declare how it is enforced","enforcement, guardrail, configuration",active
neutral-source-has-no-host-specific-language,"Neutral source must not name a host agent or its tools","agent-agnostic, compiler, guardrail",active
no-redundant-guardrails,"A guardrail scoped to one skill's own procedure belongs in that skill","knowledge-management, guardrail",active
no-runtime-dependencies,"go-getter must have no runtime dependencies","nodejs, tooling, guardrail",active
no-secrets-in-public-repo,"No credentials or non-public information may be committed","security, licensing, guardrail",active
no-unenforced-guardrail,"A guardrail describing a shipped skill's behavior must also be stated in that skill","knowledge-management, guardrail",active
node-floor-is-oldest-supported-lts,"The Node.js floor must be the oldest LTS line still supported","nodejs, tooling, guardrail",active
one-statement-one-job,"A fact, guardrail or derivation-note states one thing","knowledge-management, guardrail",active
pack-questions-have-a-recommended-default,"Every choice question in a pack must name exactly one recommended option","practice-packs, interview, guardrail",active
practice-ships-only-after-self-adoption,"A practice pack must not ship before this repo has adopted it","dogfooding, ci, guardrail",active
release-requires-passing-gate,"A release requires all three verification layers to pass","verification, eval, ci, guardrail",active
routing-escalation-bounded,"Routing escalation must be bounded and end at a human","model-routing, cost, guardrail",active
routing-governance-before-cost,"Routing must restrict candidates to governance-eligible models before comparing cost","model-routing, governance, guardrail",active
routing-uses-total-step-cost,"Routing must compare expected total step cost, never per-token list price","model-routing, cost, guardrail",active
tags-from-canonical-list,"Artifact tags must come from docs/skills/tags.md","knowledge-management, guardrail",active
telemetry-records-metadata-only,"Telemetry must record metadata only, never prompt or file content","observability, governance, security, guardrail",active
token-economy,"Facts, guardrails and procedures use the shortest phrasing that preserves meaning","knowledge-management, cost, guardrail",active
instruction-file-within-cap,"The instruction file must stay within 150 lines","practice-packs, harness, guardrail",active
procedure-delivery-rule,"Detailed procedures live in skills loaded on demand","practice-packs, harness, guardrail",active
noisy-work-rule,"Noisy work is delegated only when the cost model says the handoff is cheaper","practice-packs, harness, guardrail",active
cache-hygiene-rule,"No mid-task model, effort or instruction-file change; switches are confirmed","practice-packs, harness, guardrail",active
compaction-timing-rule,"Context is compacted at task boundaries","practice-packs, harness, guardrail",active
reviewer-read-only,"The reviewer must not modify files","practice-packs, agent-roles, guardrail",active
parallel-tasks-use-worktrees,"Parallel tasks must each use their own worktree","practice-packs, agent-roles, guardrail",active
max-concurrent-agents-rule,"No more than 3 agents run at once","practice-packs, agent-roles, guardrail",active
human-escalation-rule,"Agents must hand over to a human when blocked, before irreversible actions and on a guardrail denial","practice-packs, agent-roles, guardrail",active
handoff-has-brief-result-evidence,"Handoffs must carry a brief, a result and evidence","practice-packs, agent-roles, guardrail",active
restricted-paths-denied,"Agents must not touch restricted paths and none may be committed","practice-packs, governance, guardrail",active
prompt-logging-disabled,"Host prompt logging must stay disabled","practice-packs, governance, guardrail",active
restricted-data-hosts-rule,"Restricted data is handled only on hosts with a blocking pre-tool hook","practice-packs, governance, guardrail",active
verification-gate-blocks-done,"A step is not done while its verification checks fail","practice-packs, verification, guardrail",active
delegations-are-routed,"Delegations to a role are routed by expected total step cost","practice-packs, model-routing, guardrail",active
watches-use-the-wrapper,"Watches start through go-getter watch, --until done for CI runs and long commands","practice-packs, harness, guardrail",active
owned-files-never-clobbered,"apply, update and remove must not overwrite or delete a modified owned item without --force","generated-files, enforcement, guardrail",active
gated-actions-need-human-approval,"Irreversible and outward-facing commands need a human","practice-packs, hooks, guardrail",active
checkpoint-before-gated-action,"A gated action is preceded by a checkpoint","practice-packs, hooks, guardrail",active
branch-names-follow-the-pattern,"Branch names must match the project pattern","practice-packs, git-hooks, guardrail",active
commit-subjects-are-conventional,"Commit subjects must follow Conventional Commits","practice-packs, git-hooks, guardrail",active
changes-land-as-one-squashed-pull-request,"A change lands as one squashed pull request with green CI","practice-packs, git-hooks, guardrail",active
no-commits-on-the-default-branch,"Work must not happen on the default branch","practice-packs, git-hooks, guardrail",active
no-secrets-in-added-lines,"Added lines must not contain secrets","practice-packs, governance, security, guardrail",active
