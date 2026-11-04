---
id: 0199-we-publish-a-position-and-system-paper-and-may-change-go-getter-to-support-it
title: We publish a position-and-system paper on go-getter as a deterministic edge, and may change go-getter to support it
status: active
date: 2026-11-04
tags: [research, positioning, roadmap]
track: process
accepted-by: sergemso
---

## Decision

Accepted by the owner 2026-11-04.

1. **Form.** One scientific article of the position-and-system kind: it argues the claims of decision 0200 and describes go-getter as the worked example. Evidence is this repository as a case study plus small measured data (throughput, 0154; guardrail and gate outcomes; keyless evals, 0065), with a threats-to-validity section. No controlled with/without experiment in v1.
2. **Venue and release.** A Zenodo release first, for a DOI, through the `article-scaffold` flow (fact 0046); then an arXiv submission of the same LaTeX that cites the DOI.
3. **Where things live.** The paper source is a private repo scaffolded from `article-scaffold`. The decisions, facts and guardrails about the paper stay here; the working plan lives in the paper repo (`docs/plans/deterministic-edge-article.md`), with a pointer row in `docs/plans/roadmap.md`. The paper repo stays host-neutral and does not name go-getter in what the template ships.
4. **Authorship.** The owner is sole author. Agents may draft and run checks; every claim, number and citation is verified and accepted by the owner. The paper carries an AI-use statement and notes that the harness helped produce the paper about the harness.
5. **We may change go-getter to support the claims.** Extending or improving go-getter to demonstrate or support a thesis is allowed (a missing meter, a gate that makes a claimed property checkable, an eval for a tier).
6. **Such a change is labelled.** It carries a `Refs:` trailer naming the thesis it serves and its date, and the paper reports it as an intervention in the method section, not as background.
7. **Evidence is split by time.** Data from before an intervention is baseline, data from after is treatment. The cutoff is written in the plan before the first intervention; the baseline window is never rewritten and windows are never chosen after seeing numbers.
8. **Negative results stay in.** A change that moves no metric, or a claim that fails its adversarial check, is reported under threats to validity.
9. **The usual rules apply.** A paper-motivated change still needs its own decision or guardrail where it commits to something, and goes through the normal pull request and gates.

## Why

A position paper without evidence does not survive review, and the owner's repo is the one case study with data. Letting the system change toward the claims makes the paper design science, but tuning until the numbers look good would manufacture the evidence; items 6 to 8 keep the interventions visible and the baseline fixed. Zenodo first gives a citable record and uses the flow already built; arXiv reaches readers.
