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

Ask your agent to set up the harness, or run the bundled CLI yourself from your project (the path is wherever your host put the skill, for example `.claude/skills/go-getter-init`):

```
node <skill-dir>/cli/compiler/bin/go-getter.mjs detect
node <skill-dir>/cli/compiler/bin/go-getter.mjs coverage
```

`coverage` shows, for each of the twelve harness components and each host agent, whether a rule is enforced in CI, blocked by a host hook, advisory or not covered yet.

## Approvals

A project that adopts the `hitl` pack gates irreversible and outward-facing shell commands (force-push, hard reset, `rm -rf`, pushes, pull requests, releases, publishing). Claude Code, Kilo and OpenCode prompt you natively: `apply` writes ask rules into `.claude/settings.json`, `kilo.json` and `opencode.json`. Cursor, Codex and Gemini CLI get a hand-over: the pre-tool hook denies the command and asks the agent to have you run it. Copilot's hook hand-over is untested, so it is counted as advisory until its hook payload is confirmed. Agents in such a project will ask before pushes, pull requests and releases, among other gated commands (the catalog is in decision 0094). To get fewer prompts, narrow the classes in the pack's answers, or name outward-facing commands in `free-commands` (for example `git-push`: plain pushes then run unasked while force-push, branch deletion, pull requests and releases still ask; the project then relies on a git hook or branch protection to stop pushes to the default branch). An allow rule in your own settings does not override the committed ask rules on Claude Code. A mode that skips permission prompts defeats the native rules, and a wrapped command (`sh -c`, `eval`, a script) or `sudo`/`git -C` is not matched.

## MCP servers

An MCP server is third-party code an agent calls with the project's context, so go-getter can govern it ([decision 0138](docs/decisions/0138-mcp-servers-are-allowlisted-and-their-calls-classed-masked-and-scanned.md)). It is off until you choose it in the `hitl` and `sanitization` packs; a project that does nothing is unchanged.

- **Allowlist** (`hitl`, `mcp-policy: allowlist`, `mcp-servers`): the pre-tool hook denies a call to a server that is not listed, and an empty list allows no MCP at all. Write each server as the host shows it; the host's renaming (spaces and dots become `_`) and case are ignored when comparing. This includes user-level connectors: a server you use yourself, such as a docs connector, must be listed too. It works where the hook shows the server name (Claude Code and Codex, [fact 0036](docs/facts/0036-how-each-host-shows-an-mcp-call-to-hooks.md)); on Cursor, Gemini CLI, Copilot, Kilo and OpenCode it is advisory.
- **Read and write tools** (`mcp-read-tools`, as `server:tool`): a tool listed there runs without asking; every other tool of an allowed server is a write. A write asks once where the hook can ask (Claude Code) and is remembered per project (`go-getter approvals list` shows it, `approvals revoke mcp:<server>:<tool>` forgets it). Elsewhere you record it with `go-getter approvals allow mcp:<server>:<tool>`, or an autonomous run grants it (`go-getter run start --grant mcp:<server>:<tool>`, or list it in the `run-grants` answer).
- **Secrets in a call** (`sanitization`, `mcp-argument-scan`, on by default): a call whose arguments contain a secret is denied, naming the kind of secret and never its text.
- **Results**: secrets and personal data in an MCP result are masked on the hosts that can replace tool output; Cursor can replace MCP results only. `go-getter coverage` shows which hosts can.

Not built yet: native deny rules for servers off the list (backlog L.20).

## Autonomous runs

A person can start an autonomous run on a plan range so the agent works through it without asking for each push, pull request or merge ([decision 0130](docs/decisions/0130-an-autonomous-run-is-a-granted-plan-range-with-bounded-stops.md)). Only a person starts or ends one; the hook refuses an agent's `go-getter run start` or `run end`, and the run record lives in your user directory, outside git.

```
go-getter run start docs/plans/<plan>.md --through <step> [--hours H] [--grant <shape>]...
go-getter run status
go-getter run end
```

- **What it grants:** the outward command shapes your `hitl` answer lists (`run-grants`; by default `git-push`, `pr-create`, `pr-merge`, `pr-close`), checked at every use: a merge needs green required checks, the default branch as base and a pull request tied to a step in the range. `plan issue comment|close` on the range's steps need no approval; `create` still asks.
- **What it never grants:** force-push, history rewrites, deleting shared branches, repository settings, tags, releases and publishing.
- **When it stops:** `go-getter run next` gives the agent the next step or a reason to stop: the spend cap is reached, a step needs a person (`Human: <reason>` in the plan, or blocked), two fix attempts failed on one step, or the same guardrail denied the same step twice. A stop is never skipped. The spend cap is read from the telemetry log, so `run start` refuses while a cap is set and `telemetry-recording` is off.
- **Where spend comes from** ([decision 0144](docs/decisions/0144-a-spend-cap-on-a-host-without-a-cost-source-warns-and-starts.md), [fact 0037](docs/facts/0037-where-each-host-exposes-tokens-or-cost.md)): no host's hook carries cost, so go-getter reads what the host writes and installs nothing in your settings. On Claude Code it sums the usage in the transcript the hooks name and prices it from the project's price facts (an estimate at list price, not your bill; subagent usage may be missing). On OpenCode and Kilo it reads `session list` and `export` for the project's sessions at each `run next` and in the report, which also counts any other session in the same directory. On Codex, Cursor, Gemini CLI and Copilot nothing is read: with a cap set, `run start` says on stderr that the cap cannot bind there and starts, and the report says "not metered" instead of a dollar figure. The timeout, fix attempts, repeated denials and `Human:` steps still stop the run.
- **The report:** `go-getter run end` posts what the run did (steps, pull requests, stops, denials, spend, approvals used) as a comment on the issue of the range's last step that has one, after the secret and personal-data check, or prints it. Run it from the default branch so merged pull requests are listed.

The `autonomous-run` skill tells the agent to follow `run next`. Where the host's hook can ask, the first use of a shape asks and is remembered (`go-getter approvals list`); `go-getter approvals allow <shape>` does it ahead of time.

## Checkpoints

A project that adopts the `checkpointing` pack saves its working tree to a hidden git ref (`refs/go-getter/checkpoints/`) before a gated command, and optionally before a plan step. The pre-tool hook takes it automatically; the 10 newest are kept (or all, if you chose that). Taking one never changes a branch, the index or a file, and never blocks the command. Ignored files are not saved, and an untracked file that is not ignored is: keep secret files in `.gitignore`.

```sh
go-getter checkpoint list                       # newest first
go-getter checkpoint restore <label>            # shows what would change, changes nothing
go-getter checkpoint restore <label> --yes      # puts back modified and deleted files
```

Restore leaves files created since the checkpoint in place and lists them; remove them yourself if unwanted. Claude Code (`/rewind`) and Gemini CLI (`/restore`) also have their own commands for file edits, which do not undo what a shell command did. Copilot gets no automatic checkpoint until its hook payload is confirmed; there the agent is instructed to run `go-getter checkpoint create`.

## Sanitization

A project that adopts the `sanitization` pack scans the lines each commit, push and pull request adds for secrets (`go-getter:allow-secret` on a line, or the `scan-allow-paths` answer, skips them) and masks secrets, and optionally personal data, in tool output on every host except Cursor and OpenCode. A restricted path (a dotenv file, a key) reaches a command only through `go-getter secret run --from <file> -- <command>`, which puts its values in that command's environment and scrubs them from its output; the agent never reads the file. A command may use a path when the project's shared list names it (the `restricted-data` pack's `use-commands` answer, for a path marked `use`) or when you have approved it. You approve once: the first time a command wants a secret, the host asks you (Claude Code shows its permission prompt naming the command, the file and the files the command runs), and approving remembers it per user, outside git, for that project only. The approval is bound to a hash of the command's code (the script it runs, an `npm run` script and what that runs, and the project files they import), so editing any of those makes it ask again and an unrelated edit does not. Hosts whose hook cannot ask (Codex, and for now Cursor, Gemini CLI, Copilot, OpenCode and Kilo) refuse and print `go-getter approvals add <file> -- <command>` for you to run yourself. `go-getter approvals list` shows what is approved and marks stale ones; `revoke` removes one; an agent cannot run `add` or `revoke` or open the store. go-getter is recognised wherever it is installed (the project runner `.go-getter/bin/go-getter`, a user-level install on `PATH` or under your home directory, `npx`, `node <entry>`), and the hook reads what a command opens, so a restricted path mentioned in a commit message, an `echo` or a heredoc written to a file is only text. `sink` paths are written by `go-getter secret put <path> --stdin` or a command you declared. None of this is a sandbox: an approved command can still send the value elsewhere, and a script that opens the file itself is invisible to any check of the command's text, which is what the approval and its hash are for.

`go-getter sandbox` prints the secret settings of each host that has them (Claude Code, Codex, Gemini CLI, Copilot), built from your restricted paths and marked `confirmed` or `not confirmed`. Copy them into your user settings yourself; `apply` never writes them, and Claude Code ignores `mask` entries in a repository's settings. Prompts are not masked.

## Harness and practice packs

`go-getter-init` asks about two families of packs. Harness packs (context, verification-gate, restricted-data, sanitization, data-policy, hitl, checkpointing, orchestration, cost-routing, telemetry) set up the agent harness and work for any project with a shell and git. Practice packs (git-workflow, tracker) set up software-delivery habits and may assume GitHub or Jira. You can adopt the harness without the practice packs.

## Verification and review

The `verification-gate` pack owns what counts as done: the check commands (format, lint, typecheck, static analysis, build, tests and coverage), where each runs, and the review bar. The `orchestration` pack owns only the reviewer role (its access, read-only by default); it asks nothing about what a review must pass. The coverage command is run where the machine profile places it (CI only on the thin and CI-only profiles); go-getter does not read coverage reports, it passes the bar to the command in `GO_GETTER_COVERAGE_BAR` (`command`, `threshold` or `no-regression`) and `GO_GETTER_COVERAGE_MIN`, and the check fails when the command exits non-zero.

## Git workflow

A project that adopts the `git-workflow` pack gets branch, commit and pull request rules: branches named `type/slug` (or your own pattern), no commits or pushes on the default branch, Conventional Commit subjects, and one squash-merged pull request per change with green CI. The pre-commit and pre-push git hooks and the CI job check the branch name and the default branch; `Refs:` trailers can be required, encouraged or off. Branch protection and required checks on your hosting platform are yours to set: go-getter cannot write them. Before a push the hook reads the refs being pushed, so a tag can be pushed from any checkout and `git push origin feat:main` is refused.

A project that adopts the `tracker` pack can keep plan steps in GitHub Issues or in Jira. A step names its issue with `Issue:` (GitHub `#123`, `owner/repo#123` or the issue URL; Jira `PROJ-123` or its browse URL); `go-getter plan status|next|start` then take that step's state from the issue and report a mismatch with the plan file's marker without changing either. On GitHub, closed as completed is done, closed as not planned is moved and an open issue is not done; in Jira the status category decides (done is done, in progress is in progress, anything else is open), whatever the status is called. A step with no `Issue:` stays file-driven. Reading needs the network: GitHub through `gh`, Jira over its REST API. Jira credentials are never stored: the pack records only the names of the environment variables that hold them (by default `JIRA_EMAIL` and `JIRA_API_TOKEN`; a Data Center personal access token needs only the token variable), go-getter reads them when it runs, and a missing variable is named in the output. The Jira site must be an https URL and redirects are not followed, so the credentials go only to that site. When a tracker cannot be reached the last state read is shown, marked stale; an issue that does not exist shows as unknown.

`go-getter plan issue create|comment|close <step>` writes to the tracker. `create` opens an issue from the step's own text (never its `Check:` command, which stays in the plan) in GitHub's origin repository or the Jira project you named, and writes `Issue:` onto the step; `comment` posts the text you give; `close` closes the step's issue (in Jira by the one transition into the done category, or the transition you named, and it refuses and lists the names when there are several). The pack asks whether writes are off, ask (a human approves each one; the default) or allow. With ask, go-getter recognises the three commands by what the call runs, so the project runner, a user-level install, `npx` and `node <entry>` are all covered: on Claude Code the hook prompts once per call, on hosts with native ask rules they get rules for the usual spellings, and the others hand over; `plan issue --dry-run <verb> <step>` prints the request, needs no approval and sends nothing, and the text is refused if it contains a secret, an email, a card number or an IBAN. Raw `gh issue` and `gh api` commands remain gated by the `hitl` pack. Issue titles are untrusted text: control characters and secrets are removed before they are shown or cached, and nothing from an issue is ever run as a command. Epics and sub-issues are not synced. `go-getter refs` lists the issue of a plan step a change touches, and an issue the branch name starts with (`feat/123-title`, `feat/PROJ-123-title`), as `Refs:` targets.

## Spec tools

go-getter detects OpenSpec (an `openspec/` directory with `config.yaml`, `specs/` or `changes/`) and leaves it alone: it adds no pack, no validation and no spec format. `go-getter detect` reports `specTool`. `go-getter refs` and the `attribute` skill list each change folder a diff touches (`openspec/changes/<id>`, or `openspec/changes/archive/<date>-<id>`) as a `Refs:` target, and a branch named for an existing change lists it as a suggestion. `conform` accepts a change folder as a target. OpenSpec's own block in `AGENTS.md`, if your version writes one, stays untouched and counts toward the 150-line cap.

## Updating

`apply` records what it generated in `.go-getter/manifest.json` (commit it): the go-getter version, each adopted pack and version, a hash for every file it owns, and the keys, hook entries or marked block it owns in shared files with the value each replaced.

After upgrading go-getter, run:

```
npx --yes github:vivantel/go-getter update --dry-run
npx --yes github:vivantel/go-getter update
```

Where npm refuses GitHub fetches (`EALLOWGIT`), the `npx` lines fail. Run the same command from a copy of the CLI instead: the project's own `node .go-getter/cli/compiler/bin/go-getter.mjs update` once it has one, otherwise the `go-getter-init` skill's `cli/compiler/bin/go-getter.mjs` or `compiler/bin/go-getter.mjs` of a go-getter checkout at the release tag (`git clone --depth 1 --branch v<version> https://github.com/vivantel/go-getter`). `update` also vendors the current `.go-getter/cli`, so the project's hooks stop calling npx.

`update` re-renders each adopted pack from the answers recorded in `docs/` (a question added since takes its default), then updates the host files. It prints one plan (docs re-rendered, files added, changed or removed) and applies it on confirmation, or with `--yes`. A project without a manifest gets one on its first `update`. A session start prints one line when the project is older than the installed go-getter, and `apply --check` fails on the mismatch.

A pack whose answers cannot all be read back from `docs/` is left as it is, and the plan names the missing questions. `go-getter interview next <pack> --current` asks only those (it prints the next question as JSON for your agent to ask and writes nothing). `go-getter update --accept-defaults --dry-run` lists the default each missing answer would take; without `--dry-run` the same flag writes after you confirm the listed plan, as drafts to accept (decision 0148); it refuses `--yes` and non-interactive runs. A question a pack marks `tier: advanced` is not asked: it takes its detected value, default or recommended option, still gets its own decision, and is listed by `render-pack --dry-run` as `taken` (decision 0151; `interview next --advanced` asks it). A pack may offer profiles, named answers for one topic such as task isolation: pick one and its answers are filled in and shown, each still recorded as its own decision (0150). `--answers-from <file>` seeds an interview or `render-pack` with the answers of another project as data: unknown keys and unknown questions are refused, and the seed never supplies `acceptedBy` (0149).

A file, key or block you edited since go-getter wrote it is skipped and reported as `modified`, and the command exits non-zero. `--force` overwrites or removes it.

## Removing

```
npx --yes github:vivantel/go-getter apply --remove --dry-run
npx --yes github:vivantel/go-getter apply --remove
```

`--remove` undoes everything the manifest lists: it deletes the generated files and the generated runner, removes the hook entries and the instruction-file block, restores each replaced settings value and `core.hooksPath`, and deletes the manifest last. It leaves `docs/` (the decisions and guardrails stay as plain knowledge) and the telemetry log. Modified items are kept and reported unless you pass `--force`.

## When npx cannot fetch from GitHub

This affects only the hooks, not setup. `go-getter apply` copies the CLI into `.go-getter/cli/` (decision 0096), and the generated runner `.go-getter/bin/go-getter` (called by every host hook and the pre-push hook) runs that copy, so enforcement needs no network. The copy is gitignored, so a fresh clone or worktree lacks it. The runner then restores it with `git clone --depth 1 --branch v<version>` of `github:vivantel/go-getter` (plain git, which npm's `allow-git` setting does not govern) and runs it. Only if that also fails does it fall back to `npx --yes github:vivantel/go-getter`, pinned to the release tag of the version that wrote it, with `npm_config_allow_git=all` set for that one call unless you already set it. If npm still refuses the fetch (for example `EALLOWGIT` where git dependencies are disabled), the hook fails without blocking, enforcement does not run for that call, and the runner says so. Ways out:

- Run `go-getter apply` again from the bundled CLI to write the copy.
- Set `GO_GETTER_CLI` to `compiler/bin/go-getter.mjs` of a go-getter checkout (in your shell profile, or in the host's `env` setting for the project). The runner runs that file before the copy and never calls npx.
- Allow git fetches for npm, preferably for one command or session only: `npm_config_allow_git=all`.
