# go-getter's additions to the artifact model

The artifact model (`artifact-model.md`) is the knowledge-base core, vendored from kms at a pinned ref (decision 0212) and never edited here. This file holds what go-getter adds on top. Nothing here changes whether a core checker accepts a file.

## Draft ids

Where parallel units file artifacts, a new fact or decision may be filed as `docs/{facts,decisions}/draft-<unit>-<slug>.md` (id `draft-<unit>-<slug>`, no number). `go-getter artifacts assign` renames it to the next free `NNNN` (the highest on the default branch plus one) and rewrites references to it; existing `NNNN` artifacts are read unchanged.

## Indexes

`INDEX.md` files are generated: after writing any artifact, run `go-getter artifacts index` (`go-getter check indexes` fails when one differs from its generation). Rows are sorted by id with `title` and `tags` always double-quoted, `tags` comma-separated inside the quotes. Without the CLI, write the row by hand in the same shape.

## Procedures

A procedure may add `grounded-in: [<fact-id, decision-id, or guardrail-id>, ...]` for the artifacts its steps rest on, so `lint` catches a dangling one and `go-getter refs` lists them.

## The `go-getter:` key

Optional frontmatter key on any artifact; the only place go-getter tooling reads structured data from (it never parses prose). It is go-getter's own format, not a general knowledge-base field. Fields:

- `enforcement` (guardrails): list of `{tier, check, run, stages?, origin?}`. `tier` is `1` instruction, `2` host hook or permission, `3` git hook or CI; `check` is a one-line description; `run` is a built-in check id with params (`builtin:<id> key=value`) or a command, required for tiers 2 and 3. A tier-3 entry may list `stages` (`pre-commit`, `pre-push`; default `pre-push`); CI runs every entry. `origin` is `derived` (the check is produced from this guardrail's own text or parameters) or `authored` (hand-written); a missing value means `authored`.
- `generated-by: <pack-id>@<version>` — set on pack-emitted artifacts.
- `pack-answer: <question-id>` — the pack question the artifact answers.
- `pack-option: <option-id>` — the chosen option (a list for multi-answer questions).
- Pack data — pack-specific structured data (routing policy, data classes, model registry), under keys the pack defines.

```yaml
go-getter:
  enforcement:
    - tier: 1
      check: Where no hook routes the delegation, run `go-getter route --class <class> --host <host id>` and delegate with the `delegateModel` it returns
    - tier: 2
      check: Pre-delegation hook sets the delegated model from the router, or denies when no model is eligible
      run: builtin:route-delegation
  generated-by: cost-routing@0.1.0
  pack-answer: tiers
```

