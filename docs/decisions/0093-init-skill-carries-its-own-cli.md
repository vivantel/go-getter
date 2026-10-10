---
id: 0093-init-skill-carries-its-own-cli
title: The go-getter-init skill carries a copy of the CLI and runs it from its own directory, not through npx
status: active
date: 2026-10-07
tags: [packaging, nodejs, tooling, generated-files]
track: process
accepted-by: sergemso
---

## Decision

From the owner's review of the first install in a second repository (2026-10-07); accepted 2026-10-10. It supersedes 0023 for how skills run the CLI: 0023 is in `archive/` with `status: superseded` and `superseded-by: 0093-init-skill-carries-its-own-cli`.

- **Bundle**: `compile` copies the CLI into every skill listed in `CLI_SKILLS` (today `go-getter-init`) as `<skill>/cli`: `compiler/{bin,src,schemas,capabilities,adapters}`, `src/{packs,hooks}` and a `package.json` with the package's name, version and engines. Tests and authoring files are not copied.
- **Run**: the skill runs `node <skill-dir>/cli/compiler/bin/go-getter.mjs <command>` from the project root. No network, npx or environment variable is involved, and the CLI version equals the skill version.
- **Real files, no symlinks**: the copy is a normal part of the skill, so it travels with it through every install route: plugin caches, remote skill indexes (which list the files) and a plain copy of the skill directory.
- **Project-local skills**: `apply --skills` copies the skill with its `cli/`, so a host without a plugin install keeps a working skill. The bundled CLI finds the plugin's skills from its own location.
- **Out of scope**: the generated runner `.go-getter/bin/go-getter` runs a copy of the CLI that `apply` vendors into the project (0096), not the skill's.

## Why

The first install in a second repository stopped at `EALLOWGIT`: the skill's only way to run the CLI was an npx fetch from GitHub, which npm refused, and the plugin cache held no CLI. The package has no runtime dependencies (0019) and is small enough to ship inside the skill, which removes the network, the environment variable and the version drift between plugin and CLI.

## Tradeoffs considered

- **Publish to npm**: fixes the git restriction, but needs a public name and a release first, still needs the network, and lets plugin and CLI versions drift. Can still be added as a second channel for hooks.
- **Symlinks to a shared copy**: smaller tree, but a link pointing outside the skill breaks in remote skill indexes and in a plain `cp -r`.
- **A separate distribution repository**: solves nothing the build cannot, and adds a sync pipeline.
- **An environment variable naming a local checkout**: invisible, per machine, and only a workaround.
- **Cost accepted**: about 740 KB of generated, committed files, so any compiler change shows up as a diff in `plugins/go-getter/skills/go-getter-init/cli` (guardrail `generated-host-files-not-hand-edited` keeps it in step). A host that installs only part of a skill directory has no CLI; the skill says so and stops. Adopters of project-local skills get the copy in their repository.
