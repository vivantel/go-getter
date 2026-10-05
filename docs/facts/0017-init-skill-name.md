---
id: 0017-init-skill-name
title: The setup skill is named go-getter-init
status: active
date: 2026-10-05
tags: [interview, packaging]
kind: decision
governed-by: 0003-guided-interview-only-setup
---

The interview skill is `go-getter-init`, not `init`: two hosts ship a built-in `/init` command, and an unprefixed name would collide where plugin skills are not namespaced.
