---
id: defining-a-meter
title: Define a meter and its refresh schedule
status: draft
date: 2026-11-03
tags: [coordination, observability, procedural]
operationalizes: [a-real-world-effect-stays-inside-its-cap]
---

## Procedure

1. Write `docs/meters/<id>.md`: what it reads, the source (command, API, survey, person, agent with a manipulator), the capability tags needed (0181), the refresh rate, the cost of one reading, the expected noise, the owner, the data class and the retention.
2. If taking a reading causes a real-world effect, give its class and a cap (0180).
3. Take one reading by hand and record it as a fact of kind `reading`; compare it with the noise you expected.
4. Schedule the next reading: a `measure` unit is created when the refresh interval passes, so no daemon runs.
5. Link the meter from the outcome briefs that use it; a meter no outcome uses is flagged by lint.
