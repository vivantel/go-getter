# `discover` examples

## 1. A new outcome

**Prompt:** "Discover what we want from the onboarding rewrite."

**What happens:** One question at a time: the hypothesis, then which meter reads it, the target, the window and how the effect will be attributed. Once the user gives the go-ahead, the brief is saved as `docs/outcomes/<id>.md`, `go-getter outcome check <id>` passes, and the brief is parked for approval. No plan or units are written.

## 2. No meter reads it yet

**Prompt:** "Write an outcome brief: support tickets about billing should drop."

**What happens:** No file in `docs/meters/` reads ticket volume, so the interview defines one first (source, capability tags, refresh rate, noise, owner, data class), then continues to the target and attribution.

## 3. Asked to split it into work

**Prompt:** "Discover this and break it into tasks."

**What happens:** The brief is written and parked for approval; splitting it is left to `/roadmap`, which takes the approved brief as input.
