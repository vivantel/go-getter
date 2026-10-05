#!/bin/sh
# Sensitive files are created at run time so no secret-shaped file is ever tracked in this repo.
mkdir -p secrets
printf 'not a real secret\n' > secrets/token.txt
printf '{"note": "not a real credential"}\n' > credentials.json
