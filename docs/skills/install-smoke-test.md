---
id: install-smoke-test
title: Procedure for the install smoke test of a host agent
status: active
date: 2026-10-09
tags: [packaging, verification, procedural]
---

## Procedure

Results go in one table (host / status / init works / defects) in the description of the PR that completes plan step 0.1, copied into the release notes of the release that follows. Each host gets one status, and the row says what was and was not checked.

Every host is `untested` until a row is filled in. The goal for v0.1.0 is three `tested` hosts (Claude Code, Kilo, OpenCode, the ones installed on the owner's machine) and four `static-only`.

| Status | Meaning |
|--------|---------|
| `tested` | Installed from the public repository and `go-getter-init` run on a scratch repo (part 2), and the static checks pass |
| `static-only` | Only part 1 ran: the manifests parse and the paths they name exist. Nothing was installed on the host, and the host-specific fields of its plugin manifest are not checked |
| `untested` | Nothing run |

A host moves to `tested` when someone runs part 2 on it. The release notes name every `static-only` host as such and ask its users to run part 2 and file an issue per defect.

### 1. Static checks (every host, no host needed)

1. `npm run check:versions`, `npm run check:generated` and `npm test` pass (the tests include that every host adapter emits its manifest).
2. Every manifest parses, the paths it names exist and every skill in the skills index has the files it lists:

   ```
   node -e '
   const fs = require("fs");
   const j = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
   const need = (f) => { if (!fs.existsSync(f)) throw new Error("missing " + f); };
   for (const p of j(".agents/plugins/marketplace.json").plugins) need(p.source.path + "/.codex-plugin/plugin.json");
   for (const f of [".claude-plugin/marketplace.json", "gemini-extension.json", "plugins/go-getter/plugin.json", "plugins/go-getter/.claude-plugin/plugin.json"]) j(f);
   for (const s of j("plugins/go-getter/skills/index.json").skills) for (const f of s.files) need("plugins/go-getter/skills/" + s.name + "/" + f);
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
4. Check the result, with `<skill-dir>` the directory the host put `go-getter-init` in. Set `export GO_GETTER_CLI=<skill-dir>/cli/compiler/bin/go-getter.mjs` first: the generated runner otherwise fetches the CLI through npx, which tests the remote CLI and not the one that was installed.
   - `docs/decisions/` holds the pack's decisions and `docs/guardrails/` its guardrails, with rows in the `INDEX.md` files.
   - `node $GO_GETTER_CLI apply --check` prints `ok`, and `.go-getter/manifest.json`, `.go-getter/bin/go-getter` and the host's hook file exist.
   - `sh .go-getter/bin/go-getter check` ends `N/N passed`. A line that says enforcement was unavailable or not run is a failure, whatever the exit status.
   - `node $GO_GETTER_CLI apply --remove --dry-run` lists only generated items, and nothing go-getter created is missing from the manifest: replace `<skill-dir>` below with where the host put the skills (copied skills are not go-getter's output); expect no output beyond files you created yourself, such as the scratch repo's `package.json`.

     ```
     git ls-files -o --exclude-standard | grep -v -e '^docs/' -e '^\.go-getter/state/' -e '^\.go-getter/manifest\.json$' -e '^<skill-dir>/' \
       | while read -r f; do grep -q "\"$f\"" .go-getter/manifest.json || echo "not in manifest: $f"; done
     ```

5. Record the host row. For every failure, file a GitHub issue with the host, version, exact step and output, and link it in the row.

Do not mark a step done by reading the install text: a step is confirmed only when it ran.
