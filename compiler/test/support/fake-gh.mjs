#!/usr/bin/env node
// A stateful stand-in for the `gh` CLI, enough for `go-getter ship`: state lives in the JSON file named by GH_FAKE_STATE.
// Tests set `checks` (a list of {name, bucket} or a list of such lists, one per poll) and `mergeFails` before running.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = process.env.GH_FAKE_STATE;
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
state.calls ??= [];
const args = process.argv.slice(2);
state.calls.push(args);
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const out = (v) => {
  save();
  console.log(typeof v === 'string' ? v : JSON.stringify(v));
  process.exit(0);
};
const flag = (name) => args[args.indexOf(name) + 1];

if (args[0] === '--version') out('gh version fake');
if (args[0] === 'pr' && args[1] === 'create') {
  state.pr = { number: 7, url: 'https://example.test/o/r/pull/7', state: 'OPEN', title: flag('--title'), body: flag('--body'), head: flag('--head'), base: flag('--base') };
  out(state.pr.url);
}
if (args[0] === 'pr' && args[1] === 'view') {
  if (!state.pr) {
    save();
    console.error('no pull requests found');
    process.exit(1);
  }
  out({ number: state.pr.number, url: state.pr.url, state: state.pr.state });
}
if (args[0] === 'pr' && args[1] === 'checks') {
  const seq = state.checks ?? [];
  const polls = Array.isArray(seq[0]) ? seq : [seq];
  const i = Math.min(state.polled ?? 0, polls.length - 1);
  state.polled = (state.polled ?? 0) + 1;
  save();
  console.log(JSON.stringify(polls[i] ?? []));
  process.exit(polls[i]?.every((c) => c.bucket === 'pass') ? 0 : 1);
}
if (args[0] === 'pr' && args[1] === 'merge') {
  if (state.mergeFails) {
    save();
    console.error('merge blocked');
    process.exit(1);
  }
  state.pr.state = 'MERGED';
  state.merged = { squash: args.includes('--squash'), deleteBranch: args.includes('--delete-branch') };
  out('merged');
}
save();
console.error(`fake gh: unsupported ${args.join(' ')}`);
process.exit(1);
