---
id: 0188-a-release-request-is-read-from-what-the-user-typed-by-a-small-model-and-bounded-by-code
title: A release request is read from what the user typed by a small model and bounded by code, not matched to a phrase
status: active
date: 2026-11-04
tags: [hooks, enforcement, security]
track: product
accepted-by: sergemso
---

## Decision

Accepted on the owner's direction 2026-11-04, after the owner listed what they say: `release`, `go patch`, `major release`, `release 6`, `release 0.3`, `ship minor`, `ship`, `ship 1.0`. It replaces item 2 (the fixed phrase) and the matching rule of item 3 of 0187; the rest of 0187 stands.

1. **A model reads the message; code decides what it can do.** The user-prompt hook gives a small model the user's short message and the agent's last words from the host transcript. The model answers one closed line: a release request or not, and which bump or version if the user said one. Code accepts only that shape (`patch|minor|major`, or a version it can normalise), and anything else is "not a request".
2. **Context decides "ship".** `go-getter ship` merges pull requests, so a bare `ship` or `go` can mean that. The model sees the agent's last message to tell, and says "other" when it is not clearly a release. Questions, refusals ("not yet") and discussion are not requests.
3. **The exact phrases of 0187 skip the model.** A message that is exactly `release [the] [next] patch|minor|major` or `release vX.Y.Z` is accepted without a call, so the common case costs nothing and works with no model.
4. **A message is read only if it could be about releasing.** It must be short (80 characters) and contain a word such as release, ship, publish, cut, go, patch, minor, major, prod, beta or a digit. A pasted document is never read, and an ordinary sentence costs nothing. This is a cost gate and not the understanding.
5. **What a request lets ship.** A bare request releases what the commits make. A named bump may go up and never down: a feature cannot ship as a patch. A version, said in parts (`6`, `0.3`, `1.0`), becomes `6.0.0`, `0.3.0`, `1.0.0` and must be above the last release and not below what the commits need. What ships is still the commits at the head the user saw (0187 items 3 and 4); only the number is theirs.
6. **The model call is bounded and governed.** A fresh, tool-less run on a small model, at most 25 seconds and $0.10, through the same governance and spend-cap check as the `ship` gates (`routing-governance-before-cost`). Its own hooks do not read its prompt as the user's. Where no model can be used, the exact phrases of item 3 still work and the typed approval stays.
7. **An agent cannot hand the host text to type for the user.** A scheduled task, a wake-up or a message to the main conversation whose text passes the test of item 4 is denied. This is deliberately wider than a release phrase, since the model, not a pattern, reads what the host later submits.
8. **Names are not stored.** The saved request holds the bump or version, never the user's words, and the model is given the message and the agent's last words only for the one call (`telemetry-records-metadata-only`).

## Why

0187 made one phrase the approval, which handled one of eight things the owner actually says. Understanding free text is what a model is good at; bounding what an understood request can do is what code is good at. The risk of a misread is limited by what a request can do: it cannot change which commits ship, cannot go below what they require, is bound to the default branch head, is single use, and is visible in the release pull request.

## Tradeoffs considered

- **A longer phrase grammar:** more cases, still brittle, and the owner does not want to match strings.
- **The main agent interprets and states it:** no extra call, but then nothing the host reports ties the approval to what the user typed.
- **Confirmation after every request:** safe against a misread, and the extra step the owner wants gone.
- **Cost accepted:** a few cents and a few seconds on messages that look like a release request; a model can misread (for example "I'd release next minor if CI passes" as a request), limited as above; the agent's last message is untrusted background, so a hostile one could steer the model toward "release", which the bounds contain but do not prevent. Channels (beta, prod) are not part of this: the release command does not know them.
