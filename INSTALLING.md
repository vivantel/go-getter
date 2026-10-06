# Installing go-getter

go-getter is a plugin of skills. Install it on one host agent, then ask that agent to **"set up the agent harness here"** (the `go-getter-init` skill). Its guided interview records your choices as decisions in `docs/` and generates the enforcement for every host agent you use.

The skills run the CLI through `npx --yes github:vivantel/go-getter <command>`, which needs Node.js 22 or newer. Without Node, your choices are still recorded but enforcement stays advisory.

Every install below is untested until step 0.1 of the [plan](docs/plans/v0.2-agent-core-hardening.md) runs it on the host. Steps marked **not confirmed** come from the vendor documentation summarised in `docs/facts/0003`–`0008`, which does not give an exact end-user command; step 0.1 of the [plan](docs/plans/v0.2-agent-core-hardening.md) is the install test on each host that confirms or corrects them.

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

If the name does not resolve, run `/plugin marketplace list` and install as `go-getter@<marketplace-name>`. The manifests are [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and [`plugins/go-getter/.claude-plugin/plugin.json`](plugins/go-getter/.claude-plugin/plugin.json); `claude plugin validate` checks them.

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

Ask your agent to set up the harness, or run the CLI yourself from your project:

```
npx --yes github:vivantel/go-getter detect
npx --yes github:vivantel/go-getter coverage
```

`coverage` shows, for each of the twelve harness components and each host agent, whether a rule is enforced in CI, blocked by a host hook, advisory or not covered yet.

## When npx cannot fetch from GitHub

The generated runner `.go-getter/bin/go-getter` (called by every host hook and the pre-push hook) runs the CLI through `npx --yes github:vivantel/go-getter`, pinned to the release tag of the version that wrote it (an unreleased build is unpinned). If npm refuses the fetch (for example `EALLOWGIT` where git dependencies are disabled), the hook fails without blocking, enforcement does not run for that call, and the runner says so. Two ways out:

- Set `GO_GETTER_CLI` to `compiler/bin/go-getter.mjs` of a go-getter checkout (in your shell profile, or in the host's `env` setting for the project). The runner then runs that file and never calls npx.
- Allow git fetches for npm, preferably for one command or session only: `npm_config_allow_git=all`.
