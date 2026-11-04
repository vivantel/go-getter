---
id: 0044-repository-visibility-is-an-operator-signal
title: go-getter cannot read a repository's visibility, so a public repository is assumed unless the operator says private
status: active
date: 2026-11-04
tags: [outcomes, security]
kind: mixed
governed-by: 0179-a-meter-is-a-first-class-instrument-and-a-reading-is-a-unit-any-capable-worker-claims
last-verified: 2026-11-04
---

**Environmental.** Nothing in a clone says whether its remote is public; only the host's API does, and go-getter makes no network call to find out.

**Decision.** 0179 item 3 keeps a confidential or restricted reading out of a ref in a public repository. `go-getter measure read` therefore treats the repository as public unless `GO_GETTER_REPO_VISIBILITY=private` is set, and refuses such a reading otherwise. The default fails closed.
