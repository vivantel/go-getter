---
id: 0132-governance-splits-into-three-packs-and-existing-adoptions-are-relabelled
title: governance splits into restricted-data, sanitization and data-policy, and update relabels existing adoptions instead of asking again
status: active
date: 2026-10-11
tags: [practice-packs, compiler, configuration]
track: product
accepted-by: sergemso
---

## Decision

Refines 0129 item 2 (L.14 step 1).

1. **Three packs, continuing the `governance` version line at 0.6.0.** Question ids, defaults, recommended options and `since` values do not change.
   - `restricted-data`: `restricted-paths`, `restricted-modes`, `enforcement`, `use-commands`, `sink-sources`, `restricted-hosts`.
   - `sanitization`: `secret-scan`, `scan-allow-paths`, `pii-masking`, `pii-extra`.
   - `data-policy`: `internal-data`, `provider`, `confidential-zdr`, `prompt-logging`.
   `restricted-hosts` moves from the 0129 proposal's data policy to `restricted-data`: it decides which hosts may be near restricted paths and shares its capability test with `enforcement`. Each pack keeps component 7.
2. **A pack declares what it took over**: `replaces: { pack: "governance", questions: [...] }` in `pack.json` (checked by the pack schema). The retired pack's directory is removed; `check:self-adoption` therefore never sees an unadopted retired pack.
3. **`update` relabels before it re-renders.** For each adopted pack id that is not in this go-getter version but is named by a `replaces`, `update` rewrites `go-getter.generated-by` on the old artifacts whose `pack-answer` is a taken-over question to `<new pack>@<old version>`, then runs the ordinary re-render. The version is kept so `since` still tells which questions are new; the body text of an unchanged decision is not edited (it still says the old pack); guardrails and files are re-rendered in place as today. Nothing is asked again, and a modified owned file is left alone without `--force`.
4. **No runtime change.** Code reads adopted data by key (`adoptedData`), not by pack id, so the hook, routing and the tracker are untouched.
5. **Coverage lists all three packs** under component 7.

## Why

An inventory found no output that reads a question outside its own group (secret-scan reads scan-allow-paths, enforcement reads restricted-paths, internal-data reads provider, pii-masking reads pii-extra), so the split is mechanical. Relabelling a provenance field is a factual correction of where an artifact came from, which decisions allow in place (0067); superseding every governance decision to move it would add about twenty draft decisions for no change in rules.

## Tradeoffs considered

- **Keep `governance` as a thin retired pack**: avoids the relabel, but `check:self-adoption` would demand its adoption and every project would carry a dead pack.
- **Supersede each old decision with a new one**: purer immutability, but a flood of drafts the owner must accept for unchanged rules.
- **Restart versions at 0.1.0**: tidier, but `since` comparisons against the old adoption version would misreport new questions.
- **Cost accepted**: one new schema field and an `update` pre-step; old decisions keep text naming `governance`.
