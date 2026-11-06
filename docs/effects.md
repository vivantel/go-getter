---
id: effects
title: Real-world effect actions and their classes
status: active
date: 2026-11-06
tags: [coordination, security]
---

# Effects

The action map of decision 0180: each concrete action that has a real-world effect, its class (`reversible`, `money`, `physical` or `legal`) and the tool `go-getter act` calls for it. A person writes this file. An action not listed has an unknown class and is refused; a tool listed here is denied to host agents except through `go-getter act <action> --unit <unit> ...`, which checks the cap in the unit's grant, logs the effect as metadata and then calls the tool.

| action | class | tool |
| --- | --- | --- |
