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
- Not confirmed: the delta-file header syntax, the `validate` and `archive` CLI flags, the Node floor and package name, and whether it writes a managed block into `AGENTS.md`.

Sources (accessed 2026-10-05): https://github.com/Fission-AI/OpenSpec · https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md
