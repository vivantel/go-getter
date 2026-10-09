#!/bin/sh
# Nudges toward `go-getter update` when the project's manifest (or an adopted pack) is older than the installed
# package. Prints one line, or nothing when current or when the project has no manifest.
exec node "$(dirname "$0")/../../compiler/bin/go-getter.mjs" update --nudge --project "$PWD" 2>/dev/null
