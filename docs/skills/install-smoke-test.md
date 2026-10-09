---
id: install-smoke-test
title: Procedure for the install smoke test of a host agent
status: active
date: 2026-10-09
tags: [packaging, verification, procedural]
---

## Procedure

Results go in one table (host / status / init works / defects) in the release PR description. Each host gets one status, and the table says what was and was not checked.

| Status | Meaning | Hosts today |
|--------|---------|-------------|
| `tested` | Installed from the public repository and `go-getter-init` run on a scratch repo | Claude Code, Kilo, OpenCode |
| `static-only` | Only steps 1 below; nobody has installed it on the host | Codex, Gemini CLI, Cursor, Copilot |
| `untested` | Nothing run | none |

A host moves to `tested` when someone runs the host steps on it. Tell users of a `static-only` host so in the release notes and ask them to run the host steps and file an issue per defect.

### 1. Static checks (every host, no host needed)

1. `npm run check:versions`, `npm run check:generated` and `npm test` pass (the tests include that every host adapter emits its manifest).
2. Every manifest parses and the paths it names exist:

   ```
   node -e '
   const fs = require("fs");
   const j = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
   const need = (f) => { if (!fs.existsSync(f)) throw new Error("missing " + f); };
   for (const p of j(".agents/plugins/marketplace.json").plugins) need(p.source.path + "/.codex-plugin/plugin.json");
   for (const f of [".claude-plugin/marketplace.json", "gemini-extension.json", "plugins/go-getter/plugin.json", "plugins/go-getter/.claude-plugin/plugin.json", "plugins/go-getter/skills/index.json"]) j(f);
   need("plugins/go-getter/skills/go-getter-init/cli/compiler/bin/go-getter.mjs");
   console.log("manifests ok");
   '
   ```

3. The steps in `INSTALLING.md` for the host still match its vendor facts (`docs/facts/0003`-`0008`); a step the vendor documents no exact command for stays marked **not confirmed**.

### 2. Host steps (a host you have)

On a scratch repository (`git init`, a `package.json`), in a fresh host session:

1. Install as `INSTALLING.md` says for the host, from the public repository, not a local checkout.
2. Check the host lists the `go-getter-init` skill and the other go-getter skills.
3. Say "set up the agent harness here" and answer one pack (for example `context`) with its recommended defaults.
4. Check the result, with `<skill-dir>` the directory the host put `go-getter-init` in:
   - `docs/decisions/` holds the pack's decisions and `docs/guardrails/` its guardrails, with rows in the `INDEX.md` files.
   - `node <skill-dir>/cli/compiler/bin/go-getter.mjs apply --check` prints `ok`, and `.go-getter/manifest.json`, `.go-getter/bin/go-getter` and the host's hook file exist.
   - `sh .go-getter/bin/go-getter check` runs the guardrail checks and ends `passed`.
   - `node <skill-dir>/cli/compiler/bin/go-getter.mjs apply --remove --dry-run` lists only generated items.
5. Record the host row. For every failure, file a GitHub issue with the host, version, exact step and output, and link it in the row.

Do not mark a step done by reading the install text: a step is confirmed only when it ran.
