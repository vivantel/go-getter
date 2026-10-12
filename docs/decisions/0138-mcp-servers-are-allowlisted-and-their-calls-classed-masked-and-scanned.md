---
id: 0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned
title: MCP servers are allowlisted by name; their tool calls are classed read or write, approved once, scanned on the way out and masked on the way back
status: active
date: 2026-10-12
tags: [hooks, enforcement, roadmap, practice-packs]
track: product
accepted-by: sergemso
---

## Decision

The L.11 interview (2026-10-12) settled how go-getter governs the MCP servers an agent uses directly. This is the third relation of 0119 (go-getter governs, the core never speaks MCP) and reuses the approval machinery of 0126, 0127, 0130 and 0135; it must not build a second approval path.

1. **Servers are allowlisted by name.** A project's answer lists the allowed servers. The hook denies a call to any `mcp__<server>__<tool>` whose server is not listed; once the answer exists, an empty list allows no MCP at all. A server is written as the host's hook shows it (letters, digits, `_`, `.`, `-`), compared after the one normalisation rule the per-host fact (step 1 of the plan) fixes; a user's personal servers are subject to the same list. A host whose hook does not show a server (Cursor shows `MCP:<tool>`) cannot apply the list from the hook: it gets the native rule where there is one and is advisory otherwise. Where a host can also deny a server natively (Claude Code permission rules, Cursor `Mcp(server:tool)`), `apply` writes a **deny** rule for each server off the list, and for nothing else: never an ask or deny rule on a tool class, since a native rule fires regardless of go-getter's memory and would defeat approve-once and run grants.
2. **Tools are classed read or write.** The answer marks tools `read` (free) or `write` (asks); a tool not marked counts as write. A write call asks at first use on a host whose hook can ask (today Claude Code) and is remembered per user and project, as an outward command shape is (0135): shape id `mcp:<server>:<tool>`, stored in the approvals store, checked at each use. The shape ids are dynamic, so the closed shape catalog gains a rule for the `mcp:` family rather than a list entry. Where the hook cannot ask, a person records the approval with `go-getter approvals allow mcp:<server>:<tool>` (0126), and a run may grant it; without either, the call is denied.
3. **Arguments are scanned.** A call whose input contains a secret (the shared secret patterns, 0106) is denied before it leaves for a third-party server; the text of the secret is never shown.
4. **Results are masked.** Secrets and personal data in an MCP result are replaced on the hosts that can replace output, with the masking other tools get (0072, 0031). Cursor can replace MCP output only, so the capability row gains `rewriteMcpOutput` beside `rewriteOutput`, and the post-tool hook is installed whenever this governance is adopted, not only with restricted paths or personal-data masking. On a host that cannot replace, the guardrail is advisory and `coverage` says so.
5. **A run may grant listed write tools.** The `run-grants` answer may list `mcp:<server>:<tool>`; the run record then covers them (the `run-grants` pattern admits the `mcp:` family). The precondition checked at each use is that the server is still on the allowlist and the tool is still marked write; if not, the call asks again or is denied (0130 item 3). Never for an unmarked tool or a server off the list.
6. **Hosts.** Tool names are read per host from the hook payload; a host whose hook does not show MCP calls gets the native rule where there is one and is marked advisory otherwise. The pack home is `hitl` for the allowlist, classes and grants, and `sanitization` for the argument scan and result masking (0129).

## Why

An MCP server is code and data from a third party that an agent calls with the project's context. Today nothing says which servers are allowed, nothing gates their writes, and only Claude Code masks their output. A name allowlist is cheap to state and to audit; read and write classes keep read-only servers usable unattended while writes ask once and are remembered; scanning arguments closes the path where a secret leaves in a tool call; reusing the approvals store and the run record keeps one approval model.

## Tradeoffs considered

- **Allow all, govern per call:** less setup, but a new server is usable at once.
- **One prompt per server:** simple, but a read-only approval covers destructive tools.
- **Ask on every call:** strongest, but unattended runs on MCP tools become impractical.
- **Reads only in a run:** safer, but an unattended run stops at the first MCP write.
- **A note that MCP output is untrusted:** considered and not chosen now; 0119 already treats helper output as data.
- **Approval bound to the tool name only:** a remembered write approval does not bind to the server's code or schema version, which 0126 does for commands, because the hook cannot see them. Accepted, mitigated by pinning servers in the host's MCP configuration (0140) and by `approvals revoke`.
- **Cost accepted:** the tool classes are written by hand per server and go stale as servers change; tool names differ by host; a host without a blocking pre-tool hook gets advisory coverage only.
