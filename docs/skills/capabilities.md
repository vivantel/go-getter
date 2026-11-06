---
id: capabilities
title: Capability vocabulary
status: active
date: 2026-11-06
tags: [coordination, model-routing]
---

# Capability vocabulary

A unit lists the tags it needs in `Needs-capability:`; a worker declares the tags it holds with `go-getter work next --has tag,tag` and is offered only units whose tags it holds (decision 0181). An unknown tag is refused when a unit is approved. A tag marked `[model]` is a model or host property: the router drops models without it before comparing cost. A unit never names a model.

manipulator — a worker with a physical actuator
legal-review — a person or agent cleared to review contracts
browser — a worker that can drive a web browser
vision [model] — the model reads images
long-context [model] — the model takes a context beyond the standard window
tool-use [model] — the model calls tools
