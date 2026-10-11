---
id: 0125-tracker-write-commands
title: The commands that write to the tracker are listed
status: deprecated
date: 2026-10-11
tags: [practice-packs, roadmap]
track: process
accepted-by: sergemso
go-getter:
  tracker-write-commands: go-getter plan issue create, go-getter plan issue comment, go-getter plan issue close, .go-getter/bin/go-getter plan issue create, .go-getter/bin/go-getter plan issue comment, .go-getter/bin/go-getter plan issue close, node compiler/bin/go-getter.mjs plan issue create, node compiler/bin/go-getter.mjs plan issue comment, node compiler/bin/go-getter.mjs plan issue close
  generated-by: tracker@0.1.0
  pack-answer: write-commands
  pack-option: [go-getter plan issue create, go-getter plan issue comment, go-getter plan issue close, .go-getter/bin/go-getter plan issue create, .go-getter/bin/go-getter plan issue comment, .go-getter/bin/go-getter plan issue close, node compiler/bin/go-getter.mjs plan issue create, node compiler/bin/go-getter.mjs plan issue comment, node compiler/bin/go-getter.mjs plan issue close]
---

## Decision

The commands [go-getter plan issue create, go-getter plan issue comment, go-getter plan issue close, .go-getter/bin/go-getter plan issue create, .go-getter/bin/go-getter plan issue comment, .go-getter/bin/go-getter plan issue close, node compiler/bin/go-getter.mjs plan issue create, node compiler/bin/go-getter.mjs plan issue comment, node compiler/bin/go-getter.mjs plan issue close] need a human before they run (pack tracker@0.1.0).

## Why

A prompt matches the text of a command, so each way of running go-getter that the project uses is listed.
