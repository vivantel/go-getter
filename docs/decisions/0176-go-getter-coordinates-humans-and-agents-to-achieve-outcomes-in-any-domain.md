---
id: 0176-go-getter-coordinates-humans-and-agents-to-achieve-outcomes-in-any-domain
title: go-getter coordinates humans and agents to achieve outcomes in any domain; software delivery is the first fully supported domain
status: active
date: 2026-11-03
tags: [positioning, coordination, roadmap]
track: product
accepted-by: sergemso
---

## Decision

go-getter coordinates humans and agents working many units of work in parallel to achieve outcomes, in any domain, by configuring host agents (harness, terminology in fact 0002) and by a pull protocol over git and a tracker (0169).

1. **Scope.** An outcome is a result in the world that a meter can read (0178). Software delivery is the first domain with full support: its harness packs, verification layers (0013) and SDLC practice packs stay as they are. Other domains use the same units (0165), meters (0179), grants (0171, 0180) and acceptance (0172), and add packs and checks as they are needed.
2. **What does not change:** the name, the repository, the CLI, the plugin and the packs. go-getter still owns no runtime (0015) and has no runtime dependency.
3. **Honesty about reach.** A domain is supported when its units have an `Accept` that someone other than the author can run, its effects are classed (0180) and its meters exist (0179). Until then a domain is possible but not supported, and the documentation says which.

This supersedes 0001, whose scope was "the agent harness and SDLC practices for AI-driven development".

## Why

The owner's goal is a framework that can start a new industry from nothing, not only ship software. Real-world feedback is digitisable (a meter with a refresh rate, read by a person, a service or an agent with a manipulator), so the software-specific parts (paths as scope, tests as acceptance) generalise to resources, meters and reviews. Keeping the name and packs avoids a rename that would break installs, while a new statement of scope removes the contradiction with 0001.

## Tradeoffs considered

- **Supersede and rename:** the clearest message to a non-software audience, but renames the repository, plugin and every doc, and breaks installed plugins.
- **Leave 0001 and add a layer:** least change, but two statements of what the product is.
- **Cost accepted:** the README, INSTALLING.md and skill descriptions say "software first" and name the support conditions of item 3; a non-software domain starts with fewer checks and more human review than software has.
