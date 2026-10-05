---
id: 0054-verification-checks
title: Implement and debug steps pass the project's test, lint and typecheck commands
status: active
date: 2026-10-05
tags: [practice-packs, verification, harness]
track: process
accepted-by: sergemso
go-getter:
  verify-scope: detected
  generated-by: verification-gate@0.1.0
  pack-answer: checks
  pack-option: detected
---

## Decision

A step of class implement or debug is verified by `go-getter verify --class <class>`, which runs the test, lint and typecheck commands recorded in the command decisions; an empty command is skipped.

## Why

The quality bar of routing (decisions 0016, 0017) is these checks: a cheaper tier that passes them is as good as a dearer one, and one that fails them escalates instead of shipping (pack verification-gate@0.1.0).
