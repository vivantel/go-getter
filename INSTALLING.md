# Installing go-getter

go-getter is a plugin of skills. Install it on one host agent, then ask that agent to **"set up the agent harness here"** (the `go-getter-init` skill). Its guided interview records your choices as decisions in `docs/` and generates the enforcement for every host agent you use.

The `go-getter-init` skill carries its own copy of the CLI (`skills/go-getter-init/cli`), so setup needs no network, npx or environment variable; it needs Node.js 22 or newer. Install the whole skill directory: a copy that leaves out `cli/` cannot run. Without Node, your choices are still recorded but enforcement stays advisory.

Every install below is `untested` until the [install smoke test](docs/skills/install-smoke-test.md) (step 0.1 of the [plan](docs/plans/v0.2-agent-core-hardening.md)) records the host as `tested` (installed and set up on a scratch repo) or `static-only` (only the manifests and the paths they name were checked; nothing was installed). Steps marked **not confirmed** come from the vendor documentation summarised in `docs/facts/0003`–`0008`, which does not give an exact end-user command; the smoke test confirms or corrects them. On a host that is not `tested`, please file an issue with what happened.

- [Claude Code](#claude-code)
- [Codex](#codex)
- [Kilo Code](#kilo-code)
- [OpenCode](#opencode)
- [Cursor](#cursor)
- [Gemini CLI](#gemini-cli)
- [GitHub Copilot](#github-copilot)

## Claude Code

Add this repository as a marketplace, then install the plugin ([fact 0003](docs/facts/0003-claude-code-integration-surface.md)):

```
/plugin marketplace add vivantel/go-getter
/plugin install go-getter
```

If the name does not resolve, run `/plugin marketplace list` and install as `go-getter@<marketplace-name>`. The manifests are [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and [`plugins/go-getter/.claude-plugin/plugin.json`](plugins/go-getter/.claude-plugin/plugin.json); `claude plugin validate` checks them. **Not confirmed:** the exact `/plugin` command syntax above; fact 0003 says only that Claude Code distributes plugins through git marketplaces.

## Codex

Codex reads the repository marketplace at [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) ([fact 0004](docs/facts/0004-codex-integration-surface.md)):

```
codex plugin marketplace add vivantel/go-getter
```

Then install `go-getter` from the plugin browser. **Not confirmed:** the install step after adding the marketplace.

## Kilo Code

Kilo Code CLI is a fork of OpenCode with its own config files and `.kilo/` directories; neither has a marketplace manifest ([fact 0005](docs/facts/0005-kilo-opencode-integration-surface.md)). Kilo can track the skills remotely; add this to your `kilo.jsonc`:

```json
{ "skills": { "urls": ["https://raw.githubusercontent.com/vivantel/go-getter/master/plugins/go-getter/skills"] } }
```

The manifest is [`plugins/go-getter/skills/index.json`](plugins/go-getter/skills/index.json); Kilo re-fetches when a skill's version changes. Alternatively copy `plugins/go-getter/skills/` into `.agents/skills/` in your project. **Not confirmed:** that Kilo loads the skills from this manifest, and the `.kilo/` subdirectory names go-getter writes agents to (assumed to mirror OpenCode's).

## OpenCode

OpenCode has no marketplace manifest and no documented remote-skills manifest ([fact 0005](docs/facts/0005-kilo-opencode-integration-surface.md)). Copy `plugins/go-getter/skills/` into `.opencode/skills/` (or `.agents/skills/`) in your project. **Not confirmed:** that this loads the skills.

## Cursor

Install from the Customize sidebar, at project or user scope, using the plugin at `plugins/go-getter` ([fact 0006](docs/facts/0006-cursor-integration-surface.md)). **Not confirmed:** whether Cursor installs a plugin directly from a GitHub repository or only from a team marketplace; if it does not, copy `plugins/go-getter/skills/` into `.agents/skills/` in your project.

## Gemini CLI

Install the extension from this repository ([fact 0007](docs/facts/0007-gemini-cli-integration-surface.md)); its manifest is [`gemini-extension.json`](gemini-extension.json):

```
gemini extensions install https://github.com/vivantel/go-getter
gemini extensions list
```

## GitHub Copilot

Copilot CLI installs a plugin from a path ([fact 0008](docs/facts/0008-copilot-integration-surface.md)). Clone the repository and install the plugin directory:

```
git clone https://github.com/vivantel/go-getter
copilot plugin install ./go-getter/plugins/go-getter
```

**Not confirmed:** installing straight from a GitHub URL, and whether the IDE agent mode picks the plugin up.

## After installing

Ask your agent to set up the harness, or run the bundled CLI yourself from your project (the path is wherever your host put the skill, for example `.claude/skills/go-getter-init`):

```
node <skill-dir>/cli/compiler/bin/go-getter.mjs detect
node <skill-dir>/cli/compiler/bin/go-getter.mjs coverage
```

`coverage` shows, for each of the twelve harness components and each host agent, whether a rule is enforced in CI, blocked by a host hook, advisory or not covered yet.

## Approvals

A project that adopts the `hitl` pack gates irreversible and outward-facing shell commands (force-push, hard reset, `rm -rf`, pushes, pull requests, releases, publishing). Claude Code, Kilo and OpenCode prompt you natively: `apply` writes ask rules into `.claude/settings.json`, `kilo.json` and `opencode.json`. Cursor, Codex and Gemini CLI get a hand-over: the pre-tool hook denies the command and asks the agent to have you run it. Copilot's hook hand-over is untested, so it is counted as advisory until its hook payload is confirmed. Agents in such a project will ask before pushes, pull requests and releases, among other gated commands (the catalog is in decision 0094). To get fewer prompts, narrow the classes in the pack's answers: an allow rule in your own settings does not override the committed ask rules on Claude Code. A mode that skips permission prompts defeats the native rules, and a wrapped command (`sh -c`, `eval`, a script) or `sudo`/`git -C` is not matched.

## Updating

`apply` records what it generated in `.go-getter/manifest.json` (commit it): the go-getter version, each adopted pack and version, a hash for every file it owns, and the keys, hook entries or marked block it owns in shared files with the value each replaced.

After upgrading go-getter, run:

```
npx --yes github:vivantel/go-getter update --dry-run
npx --yes github:vivantel/go-getter update
```

`update` re-renders each adopted pack from the answers recorded in `docs/` (a question added since takes its default), then updates the host files. It prints one plan (docs re-rendered, files added, changed or removed) and applies it on confirmation, or with `--yes`. A project without a manifest gets one on its first `update`. A session start prints one line when the project is older than the installed go-getter, and `apply --check` fails on the mismatch.

A file, key or block you edited since go-getter wrote it is skipped and reported as `modified`, and the command exits non-zero. `--force` overwrites or removes it.

## Removing

```
npx --yes github:vivantel/go-getter apply --remove --dry-run
npx --yes github:vivantel/go-getter apply --remove
```

`--remove` undoes everything the manifest lists: it deletes the generated files and the generated runner, removes the hook entries and the instruction-file block, restores each replaced settings value and `core.hooksPath`, and deletes the manifest last. It leaves `docs/` (the decisions and guardrails stay as plain knowledge) and the telemetry log. Modified items are kept and reported unless you pass `--force`.

## When npx cannot fetch from GitHub

This affects only the hooks, not setup. The generated runner `.go-getter/bin/go-getter` (called by every host hook and the pre-push hook) runs the CLI through `npx --yes github:vivantel/go-getter`, pinned to the release tag of the version that wrote it (an unreleased build is unpinned). If npm refuses the fetch (for example `EALLOWGIT` where git dependencies are disabled), the hook fails without blocking, enforcement does not run for that call, and the runner says so. Two ways out:

- Set `GO_GETTER_CLI` to `compiler/bin/go-getter.mjs` of a go-getter checkout (in your shell profile, or in the host's `env` setting for the project). The runner then runs that file and never calls npx.
- Allow git fetches for npm, preferably for one command or session only: `npm_config_allow_git=all`.
