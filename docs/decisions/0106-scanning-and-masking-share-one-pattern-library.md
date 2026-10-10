---
id: 0106-scanning-and-masking-share-one-pattern-library
title: Secret scanning and PII masking share one pattern library, scan added lines only, and mask with per-session pseudonyms kept as salted hashes
status: active
date: 2026-10-10
tags: [governance, security, enforcement]
track: product
accepted-by: sergemso
---

## Decision

Refines 0072 for slices S2 (scanning) and S3 (masking). Both live in the governance pack.

- **One pattern library.** The patterns tier-2 output redaction already uses (private-key blocks and the AWS, Google, GitHub, GitLab, Slack, npm, Anthropic and Stripe token formats) move to one module that redaction and scanning both read, with JWTs and `secret|token|password|api_key = <long value>` assignments added. No entropy detection, and no vendored scanner (guardrail `no-runtime-dependencies`).
- **Scanning reads added lines only:** the staged diff before a commit, the commits being pushed, the pull request's diff in CI. History and untouched files are not scanned. A finding names the file, line and kind, never the value. A line carrying `go-getter:allow-secret` is skipped, and the pack answer lists path globs to skip (default none). Scanning is on by default.
- **PII masking** covers email addresses, payment card numbers that pass the Luhn check and IBANs that pass mod-97 by default; phone numbers and national-ID formats are an opt-in list, since they are locale-bound and match ordinary numbers. It replaces tool output on the hosts that can (all but Cursor and OpenCode, which the coverage report must say).
- **Pseudonyms.** A masked PII value becomes `[email-1]`, `[card-1]`, `[iban-1]`: the same value gets the same name within a session. The map holds `{salt, hash(value) -> n}` in the restricted state directory and never a value; the salt is random per session, and the map is deleted at session end, or after 24 hours where the host sends neither a session id nor an end event. Secrets keep the single marker `[redacted by go-getter]`.

Stated limits: prompts are not masked (a prompt hook can block but not rewrite; fact 0027) and neither are writes; the hash of a low-entropy value such as an email can be guessed offline, so the file stays restricted and short-lived; the scanner misses a token format that is not listed.

## Why

Redaction already carries the token patterns, so a second list for scanning would drift from it. Scanning added lines never blocks a push on someone else's old secret. The owner chose pseudonyms over a typed placeholder so an agent can tell two addresses apart; the salted-hash map keeps that from becoming a second copy of the data masking protects.

## Tradeoffs considered

- **Entropy detection**: catches unknown formats but flags hashes and lockfile strings and costs trust.
- **A full tracked-file scan in CI**: finds old secrets, but a mature repository fails its first run until they are triaged.
- **Typed placeholders without a map**: nothing stored, but two different emails look the same.
- **Plaintext map**: exact and debuggable, but a file of the very values masking protects.
- **Cost accepted**: the pseudonym map is state to keep and clean, and the scanner's list of formats must grow with new providers.
