---
id: reviewer-read-only
title: The reviewer must not modify files
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, guardrail]
governed-by: 0039-reviewer-access
grounded-in: [0039-reviewer-access]
derivation-note: Given a findings-only reviewer, a reviewer that edits marks its own work.
go-getter:
  enforcement:
    - tier: 1
      check: Instruction plus the agent file's tool restriction where the host has one
    - tier: 3
      check: Each generated reviewer agent file restricts the role to reads where its host has a tool list or permission block
      run: builtin:reviewer-read-only role=reviewer
      origin: derived
  generated-by: orchestration@0.1.5
  pack-answer: reviewer
  pack-option: read-only
---

## Guardrail

The reviewer reports findings and changes nothing. Hosts with tool lists restrict it natively, and git hooks and CI fail when a generated reviewer file on such a host names a tool that writes; elsewhere (hosts without a tool list) this is advisory (tier 1).
