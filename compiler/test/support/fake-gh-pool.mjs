#!/usr/bin/env node
// A `gh` stand-in for the pool tests: the pull requests live in the JSON file named by GH_FAKE_STATE as `prs`:
// [{number, head, state: OPEN|CLOSED|MERGED, headRefOid, mergedAt}]. Only `pr list --head B --state S` and `pr view` are answered;
// `pr list` always prints the matching records as a JSON array (callers parse it in Node; `--jq` is ignored).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = process.env.GH_FAKE_STATE;
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
state.calls ??= [];
const args = process.argv.slice(2);
state.calls.push(args);
writeFileSync(file, JSON.stringify(state, null, 2));
const flag = (name) => args[args.indexOf(name) + 1];
const prs = state.prs ?? [];
if (process.env.GH_FAKE_FAIL === '1' && args[0] !== '--version') { console.error('gh: network unreachable'); process.exit(1); }
if (args[0] === '--version') console.log('gh version fake');
else if (args[0] === 'pr' && args[1] === 'list') {
  const head = flag('--head');
  const want = String(flag('--state') ?? 'open').toUpperCase();
  console.log(JSON.stringify(prs.filter((p) => (!head || p.head === head) && (want === 'ALL' || p.state === want))));
} else if (args[0] === 'pr' && args[1] === 'view') {
  const p = prs.find((x) => String(x.number) === String(args[2]) || x.head === args[2]);
  if (!p) { console.error('no pull requests found'); process.exit(1); }
  console.log(JSON.stringify(p));
} else { console.error(`fake gh: unsupported ${args.join(' ')}`); process.exit(1); }
