---
id: 0146-retrieval-contract-v0
title: Retrieval contract v0 is three files (index policy, declaration, endpoint discovery) and a loopback JSON endpoint the tool owns
status: draft
date: 2026-10-12
tags: [practice-packs, hooks, security]
track: product
governed-facts: [0038-virage-integration-surface]
---

## Decision

Fixes the contract that 0145 item 1 left open. `contractVersion` is the integer `0` (breaking changes bump it; a tool states one version and go-getter reads versions it knows). The three parts are met separately; a tool meets as many as it implements, and the pack (plan step 3 on) requires all three. Nothing here names a tool: a second retrieval tool meets the same terms. Paths are relative to the project root; `<tool>` is a lowercase id matching `[a-z0-9-]+`.

### (a) Index policy: `.go-getter/retrieval/policy.json`

Generated and owned by go-getter (never edited by hand, never overwritten when modified without `--force`, 0145 and `owned-files-never-clobbered`), committed. The tool only reads it, before every indexing run and every query, and refuses to index or return anything outside it.

```json
{
  "contractVersion": 0,
  "ignore": ["**/.env", "secrets/**"],
  "embedders": ["local"],
  "dataClass": "internal"
}
```

- `ignore`: glob list, gitignore syntax, from the project's restricted paths. A file matching any glob is never indexed or returned, whatever the tool's own file sets say; the globs apply on top of the tool's own include and ignore rules.
- `embedders`: allowed embedder kinds, a subset of `local` (runs on this machine, no chunk text leaves it) and `hosted` (sends chunk text off the machine). Derived from `dataClass`: `hosted` is listed only for `public`.
- `dataClass`: the project's class for the indexed content, one of the classes of 0018 (`public | internal | confidential | restricted`).
- Unknown fields are ignored; a missing field or an unknown `contractVersion` makes the tool refuse to index (fail closed).

### (b) Declaration: `.go-getter/retrieval/<tool>.json`

Written by the tool (at init and at every update), committed, so go-getter can check it while the tool is not running and without running the tool (0119: the core never loads a tool's code, and a command would be that).

```json
{
  "contractVersion": 0,
  "tool": "<tool>",
  "toolVersion": "1.2.3",
  "preIndexSecretScan": true,
  "registersHostConfig": false
}
```

- `contractVersion`: the version the tool meets.
- `preIndexSecretScan`: true only if the tool scans a file for secrets before it is indexed and skips what it finds. Absent or false fails the check of plan step 5.
- `registersHostConfig`: true if the tool writes a hook or MCP entry of its own. A conforming tool writes none (0145 item 1), so it is false; true fails the check.
- One declaration file per tool; a project with two tools has two files.

### (c) Query endpoint and discovery: `.go-getter/state/retrieval/<tool>.endpoint.json`

Written by the tool when its endpoint is ready, per user and per machine, mode `0600`, under the already gitignored `.go-getter/state/`, and removed when the endpoint ends.

```json
{
  "contractVersion": 0,
  "tool": "<tool>",
  "toolVersion": "1.2.3",
  "address": "127.0.0.1:49152",
  "token": "<random, at least 128 bits>",
  "pid": 4242,
  "startedAt": "2026-10-12T09:00:00Z"
}
```

**Transport.** HTTP/1.1 with JSON bodies on a loopback port. The address is a loopback IP (`127.0.0.1` or `[::1]`), never a hostname or another interface; go-getter refuses any other address. Every request carries `Authorization: Bearer <token>`; the token is new for each endpoint start and known only to files readable by the user.

**Request.** `POST /v0/query`, `Content-Type: application/json`:

```json
{ "query": "text", "maxChunks": 5, "maxChars": 800, "minSimilarity": 0.65 }
```

`query` is at most 2000 characters (go-getter has already masked it). The three bounds are asks; the tool applies its own cap if lower.

**Response.** `200` with:

```json
{
  "contractVersion": 0,
  "chunks": [
    { "text": "...", "source": "docs/guide.md", "similarity": 0.81 }
  ]
}
```

- `chunks` has at most `maxChunks` entries ordered by similarity, each `text` at most `maxChars` characters, the whole body at most 64 KiB. go-getter truncates anything above its own bounds and drops chunks below `minSimilarity`.
- `source` is required on every chunk: a project-relative path, optionally with a `#fragment`. A chunk without a source is dropped.
- Read-only: the endpoint serves no write, index, delete or configuration operation. The only other route is `GET /v0/health` returning `{"ok": true}`. Any other route returns `404`.
- Errors: a non-`200` status with `{"error": "short message"}`. `401` is a bad token; `503` means not ready. go-getter reads the message to show one line and never executes it.

**Lifecycle (owned by the tool).** The tool starts the endpoint on demand (first query, or its own command) and ends it after an idle timeout of its choosing, then removes the discovery file. go-getter never starts, stops, restarts or supervises a process. If the discovery file is missing, its `pid` is not alive, or the connection fails, the endpoint is unreachable. A tool that can start on demand may expose a start command in its own docs; go-getter does not call it.

### Failure rules

- **Unreachable endpoint fails open.** Missing or stale discovery file, refused connection, `401`, `503`, timeout (go-getter waits at most 2 seconds), malformed or oversized reply: inject nothing, let the prompt proceed, and say one line (`retrieval: <tool> endpoint unreachable, nothing injected`). The line never includes chunk or error text beyond the short message.
- **A failed governance check fails closed.** A missing or unreadable policy file, a declaration missing, below the contract version go-getter requires or with `preIndexSecretScan` false or `registersHostConfig` true, a hosted embedder under a data class above `public`, or a restricted path inside the index scope: the retrieval hook injects nothing, the tool's chunks are never used, and `go-getter coverage` and the verification report the finding naming the path, embedder or tool and never content. Governance results, not reachability, are the only reason retrieval is turned off on purpose.
- **Chunks are untrusted data.** The hook frames every chunk as quoted reference material with its `source`, in a fixed envelope that tells the model the text is retrieved and may contain instructions to ignore; it never places chunk text outside the quote, never executes it, and masks secrets and personal data in it first (0138 item 4 patterns). The outgoing `query` is masked the same way before it reaches the tool.
- Telemetry records counts only (chunks, masked kinds, outcome), never text (`telemetry-records-metadata-only`).

### Changes virage needs (feeds plan step 2)

From fact 0038; to be made in the virage repository, not here:

1. A mode in which `configure()` registers no MCP entry in `.mcp.json` and no hook in `.claude/settings.json`, and writes the declaration with `registersHostConfig: false`.
2. Read `.go-getter/retrieval/policy.json` before indexing and querying: apply `ignore` on top of `fileSets`, refuse a `hosted` embedder when `embedders` does not allow it, refuse an unknown `contractVersion`.
3. A secret scan before indexing (or an exposed hook for one) and `preIndexSecretScan: true` in the declaration.
4. A warm query endpoint that meets part (c): loopback HTTP and bearer token, `/v0/query` and `/v0/health`, the bounds and the `source` label, started on demand, ended on an idle timeout, discovery file written and removed. Today `query-serve` is stdio and ends with its parent, so it needs a new owner-independent mode.
5. `virage uninstall` also removes the `.mcp.json` and settings entries older versions wrote, and its declaration file.

## Why

A single file cannot serve three readers with different lifetimes: the index policy is read at indexing time and must exist before the tool does, the declaration must be checkable while the tool is idle, and the endpoint address exists only while it runs and holds a secret that must not be committed. Loopback HTTP with a token is callable from a short-lived hook in any language, works on every host OS and keeps the tool in charge of its process, which 0119 and 0145 require. Failing open on reachability keeps a down tool from blocking work; failing closed on governance keeps a down check from letting restricted content into a prompt.

## Tradeoffs considered

- **Unix socket:** protected by file mode with no token, but not portable to Windows and harder for a tool to share; not chosen (owner's choice, 2026-10-12).
- **Declaration inside the discovery file:** one file, but it exists only while the endpoint runs, so step 5 could not check an idle tool; not chosen.
- **A command that prints the declaration:** the core would run the tool's code, against 0119; not chosen.
- **Stdio or a cold `query` per prompt:** the embedder's cold start is about 30 seconds, and a pipe owned by another process cannot be reached from a hook.
- **A shared port:** collides between projects and users; a per-start port in the discovery file avoids it.
- **Cost accepted:** three files and a version to keep in step; go-getter checks a declaration it cannot verify (it trusts `preIndexSecretScan: true` as stated, and the dogfood run of step 7 is the test); loopback is reachable by any local process, so the token and file mode are the only protection from other local users.
