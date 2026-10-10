---
id: 0029-openspec-layout-and-workflow
title: OpenSpec keeps living specs under openspec/specs and per-change folders with delta specs that are archived on completion
status: active
date: 2026-10-05
tags: [roadmap, tooling, packaging]
kind: environmental
governed-by: 0075-spec-tools-are-detected-and-tolerated
expires: 2027-01-04
---

- Layout: `openspec/specs/` (requirements with WHEN/THEN scenarios), `openspec/changes/<change-id>/` (`proposal.md`, `design.md`, `tasks.md`, delta specs under `specs/`) and `openspec/changes/archive/YYYY-MM-DD-<name>/`. Deltas use ADDED, MODIFIED, REMOVED and RENAMED sections.
- Workflow commands in the host: `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive` (spelling varies by host; `/opsx-propose` on Copilot and Cursor). Archive moves the change folder and offers to sync its deltas into the specs.
- CLI: `openspec init`, `update`, `config`, `list`, `status --change <name> --json`, `schemas`, `schema init`; `--strict` appears in troubleshooting. The tool supports 30+ AI tools.
- Confirmed against OpenSpec 1.14.1 (2026-10-10): the npm package is `@fission-ai/openspec` with Node `>=20.19.0`. Delta spec sections are `## ADDED Requirements`, `## MODIFIED Requirements` and `## REMOVED Requirements`. `openspec validate [item] [--all|--changes|--specs|--archived] [--strict] [--json]`; `openspec archive [change] [--yes] [--skip-specs] [--no-validate]`, where `--yes` is required without a terminal. Archived folders are `changes/archive/YYYY-MM-DD-<name>/`. Change names are lowercase kebab-case (hyphens only, a leading number allowed). Current versions no longer generate `AGENTS.md` or `CLAUDE.md`; `init` can install skills under `.agents/skills/`, and a legacy `openspec/AGENTS.md` is cleaned up on update.
- Not confirmed: the RENAMED section header, and the marker syntax of the managed block that older versions wrote into `AGENTS.md`.

Sources (accessed 2026-10-05, and 2026-10-10 for the confirmed list): https://github.com/Fission-AI/OpenSpec · https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md · https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md · https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md
