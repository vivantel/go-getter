---
id: 0038-agent-roster
title: Work is delegated to planner, explorer, implementer, reviewer and tester agents
status: active
date: 2026-10-05
tags: [practice-packs, agent-roles, harness]
track: process
accepted-by: sergemso
go-getter:
  roles:
    - id: planner
      description: Turns a brief into an ordered plan with a done-when check per step.
      task-class: plan
      access: read-only
      instructions: Turn the brief into an ordered plan with a done-when check per step. Read the code and docs you need; do not change files.
    - id: explorer
      description: Searches and reads the codebase to answer questions, with file and line references.
      task-class: explore
      access: read-only
      instructions: Search and read the code to answer the brief's questions. Report file paths and line numbers; do not change files.
    - id: implementer
      description: Makes the change a brief describes and runs the project checks.
      task-class: implement
      access: write
      instructions: Make the change the brief describes, nothing more. Run the project's checks before you report.
    - id: reviewer
      description: Reviews a change against the brief, decisions and guardrails and reports findings by severity.
      task-class: review
      access: read-only
      instructions: Review the change against the brief and the project's decisions and guardrails. Report findings by severity, each with file and line; say so when there are none.
    - id: tester
      description: Writes and runs tests for a change and reports failures with their output.
      task-class: debug
      access: write
      instructions: Write and run tests for the change. Report failures with the command and its output; do not change production code.
  generated-by: orchestration@0.1.0
  pack-answer: roster
  pack-option: five-roles
---

## Decision

Delegate work to these agent roles: planner (plan), explorer (explore), implementer (implement), reviewer (review), tester (debug); the parenthesis is the routing task class. `go-getter apply` compiles them into each host agent's native format. (pack orchestration@0.1.0).

## Why

Separate roles are the routing lever and keep verification independent of implementation (decisions 0014, 0016).
