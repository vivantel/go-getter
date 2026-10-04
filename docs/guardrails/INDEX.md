# Guardrails index (CSV)

id,title,tags,status
generated-host-files-not-hand-edited,"Generated host-agent files must never be hand-edited","generated-files, compiler, guardrail",active
guardrails-declare-enforcement,"Every guardrail must declare how it is enforced","enforcement, guardrail, configuration",active
neutral-source-has-no-host-specific-language,"Neutral source must not name a host agent or its tools","agent-agnostic, compiler, guardrail",active
no-redundant-guardrails,"A guardrail scoped to one skill's own procedure belongs in that skill","knowledge-management, guardrail",active
no-runtime-dependencies,"go-getter must have no runtime dependencies","nodejs, tooling, guardrail",active
no-secrets-in-public-repo,"No credentials or non-public information may be committed","security, licensing, guardrail",active
no-unenforced-guardrail,"A guardrail describing a shipped skill's behavior must also be stated in that skill","knowledge-management, guardrail",active
one-statement-one-job,"A fact, guardrail or derivation-note states one thing","knowledge-management, guardrail",active
practice-ships-only-after-self-adoption,"A practice pack must not ship before this repo has adopted it","dogfooding, ci, guardrail",active
release-requires-passing-gate,"A release requires all three verification layers to pass","verification, eval, ci, guardrail",active
routing-escalation-bounded,"Routing escalation must be bounded and end at a human","model-routing, cost, guardrail",active
routing-governance-before-cost,"Routing must restrict candidates to governance-eligible models before comparing cost","model-routing, governance, guardrail",active
routing-uses-total-step-cost,"Routing must compare expected total step cost, never per-token list price","model-routing, cost, guardrail",active
tags-from-canonical-list,"Artifact tags must come from docs/skills/tags.md","knowledge-management, guardrail",active
telemetry-records-metadata-only,"Telemetry must record metadata only, never prompt or file content","observability, governance, security, guardrail",active
token-economy,"Facts, guardrails and procedures use the shortest phrasing that preserves meaning","knowledge-management, cost, guardrail",active
vendored-kms-changes-only-via-sync,"Vendored kms files change only through the sync script","vendoring, kms, guardrail",active
