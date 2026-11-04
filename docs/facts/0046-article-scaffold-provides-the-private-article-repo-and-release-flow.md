---
id: 0046-article-scaffold-provides-the-private-article-repo-and-release-flow
title: article-scaffold provides the private article repo, the Zenodo release flow and a theses map
status: active
date: 2026-11-04
tags: [research, knowledge-management]
kind: environmental
last-verified: 2026-11-04
---

`~/projects/sergemso/article-scaffold` is a Cookiecutter template that creates a LaTeX article repo (`metadata.yaml` as the single source, CI builds of PDF and DOCX, a pre-push hook, `upgrade` for later template fixes). The article repo is private; each has a public companion repo that receives an allowlisted snapshot on every final tag, which Zenodo archives. Publishing is dry-run first; release-gate and publish orders close only by a confirmation in the owner's terminal. The default `target_deposit` is Zenodo.

It has a theses map: argument nodes with numbered premises, objection and defense fields, and an adversarial lint. Its guardrails say an agent-written node is not accepted until a human accepts it, the map and its check cache never reach the companion, manuscript text is never an argument to an outbound call, and nothing the template ships names go-getter or requires one agent host.

Source: its `README.md` and `AGENTS.md`, read 2026-11-04.
