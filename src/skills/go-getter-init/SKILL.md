---
name: go-getter-init
description: Set up this project's agent harness and SDLC practices through a guided interview, one question at a time with a recommended default for each, then record every choice as knowledge-base decisions and guardrails and generate their enforcement. Use when the user wants to set up, configure or reconfigure go-getter, e.g. "set up the agent harness here", "configure model routing and guardrails".
---

# go-getter init

Run the CLI as `npx --yes github:vivantel/go-getter <command>` (written `gg <command>` below). It needs Node.js; if `node --version` fails or is older than the oldest supported LTS, tell the user that go-getter will record their choices but enforcement on this machine stays advisory until Node is installed, and continue.

## 1. Look before asking

Run `gg detect` and keep its JSON. Anything it answers (languages, test commands, CI, host agents in use, sensitive paths, existing `docs/` knowledge base) is stated to the user for confirmation, never asked from scratch.

## 2. Choose packs

Run `gg packs`. Present the packs grouped by family (harness, sdlc) and ask which to configure. Recommend all harness packs. Order the chosen packs so every pack comes after the packs it `requires`.

## 3. Interview, pack by pack

For each pack, run `gg pack <id>` and walk its `questions` in order:

- Skip a question whose `when` condition is not met by earlier answers.
- If the question has a `detect` key (a dotted path into the `gg detect` result, e.g. `commands.test`) and the detection result covers it, propose that value and ask for confirmation.
- A question of `type: text` or `type: list` has no options: ask it with the prefilled value (the detected value, else the question's `default`; a list question with both prefills the detected items followed by the default items not already in it) and let the user accept or edit it. Check the answer against the question's `pattern` (each item, for a list) and re-ask on a mismatch. A list answer is an array of strings.
- Ask a choice question exactly one at a time. Show every option with its `tradeoff`, list the recommended option first and mark it "(Recommended)". Never invent options; the pack's options are the full list, plus the user's free-text answer if none fits — in that case explain that a free-text answer cannot be rendered and ask them to pick the closest option or stop.
- After the first question of a pack, offer "accept the recommended defaults for the rest of this pack" (recommended option for choice questions, the prefilled value for text and list questions).

Ask once, before rendering, who is accountable for these decisions (their name for `accepted-by`).

## 4. One go-ahead, then render

For each pack, write its answers to `.go-getter/state/init/<pack-id>.answers.json`:

```json
{ "answers": { "<choice-id>": "<option-id>", "<text-id>": "<text>", "<list-id>": ["<item>"] }, "acceptedBy": "<name>", "detect": { } }
```

Run `gg render-pack <pack-id> --answers <file> --dry-run` for every pack and show the user the combined list of files that will be created, including any tags that will be added to `docs/skills/tags.md`. Get one explicit go-ahead. Then run the same commands without `--dry-run`.

Never write or edit the generated decisions, guardrails, procedures or INDEX rows by hand; the renderer owns numbering, frontmatter and indexes.

## 5. Enforce and report

Run `gg apply` to generate the instruction section, host hooks and permissions, git hooks and CI checks for the host agents in use, then `gg check`. Report what was configured per pack, then run `gg coverage` and show, for each harness component and host agent, whether rules are enforced in CI, blocked by host hooks, advisory, or not covered yet.

## Reconfigure an adopted pack

Run `gg reconfigure <pack-id> --current` to get the recorded answers and use them as the defaults while re-asking the pack's questions as in step 3. Write the new answers file, run `gg reconfigure <pack-id> --answers <file> --dry-run`, show which decisions will be superseded, which artifacts re-rendered and which deprecated, get one go-ahead, run it without `--dry-run`, then `gg apply`. Never edit generated decisions in place.
