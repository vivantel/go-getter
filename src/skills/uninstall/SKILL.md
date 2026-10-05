---
name: uninstall
description: Finds everything bootstrap/capture added to this project and offers to detach or remove it, before you actually uninstall the go-getter plugin. Use when a team is winding down use of go-getter's knowledge base, e.g. "we're uninstalling go-getter, clean up what it added", "remove go-getter's seeded guardrails from this repo".
---

Run this *before* uninstalling the go-getter plugin — nothing can act automatically afterward, so this is the only window for cleanup. Finds every trace `bootstrap`/`capture` left in this project and offers to detach (keep the content, stop tracking it as go-getter's) or remove it.

## What to scan for

1. **`seeded: true` files** — anywhere under `docs/`, matching this skill's sibling `../../templates/` (one subdirectory per artifact type; currently just `guardrails/`).
2. **`bootstrap-generated: true` files** — scan for the marker anywhere under `docs/`, the same way as category 1; don't hardcode which files carry it, since `bootstrap` may stamp more of them over time (currently `docs/skills/product-track-roles.md`, `docs/skills/process-track-roles.md`, and `docs/facts/docs-manifest.md`, all three written by a single `bootstrap` run).
3. **The `<!-- knowledge-base:start -->`/`<!-- knowledge-base:end -->` block** in the project's agent-instructions file (`AGENTS.md` or whatever host-specific equivalent it uses), if present.
4. **Still-`status: draft` decisions, or facts still `governed-by: TBD`** — a proposal (from `bootstrap` or from `capture`'s own check 1, which drafts stubs the same way) that nobody has acted on yet. Report these separately from categories 1-3 and note plainly that they carry no `seeded`/`bootstrap-generated` marker — they're identified by status, not by marker.

## Report first, then act

List everything found, grouped by category, before asking about any of it — never surface per-file prompts one at a time with no overview. Then, per finding, ask: **detach** (strip `seeded`/`bootstrap-generated`, or the AGENTS.md markers alone leaving the section text, keeping everything else as the team's own) or **remove** (delete the file, or delete just the marked block from AGENTS.md, or delete the still-draft decision/fact). Same confirmation for both — propose, wait for an explicit yes, exactly like every other skill in this plugin.

## Never touch

Any decision/fact past `status: draft`/`governed-by: TBD` — that's the team's own commitment, regardless of topic, marker or no marker. Any guardrail without a `seeded` marker, or any other file without `bootstrap-generated`, outside of category 4 above — that's project-owned. Custom guardrails the team wrote themselves, even ones that resemble something go-getter seeds.

## Out of scope

The plugin's own hooks file — it lives in the plugin's own installed directory, not this project's repo, and the host removes it automatically when the plugin is uninstalled. Actually uninstalling the plugin itself — that's a host command, not this skill's job.
