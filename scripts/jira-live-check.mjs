#!/usr/bin/env node
// A live check of go-getter's Jira support against the owner's real Jira site. It is meant to run through
// `go-getter secret run --from .env -- node scripts/jira-live-check.mjs [write]`, which puts the owner's credentials in this
// process's environment and scrubs them from its output; nothing here prints, writes or records a credential.
//
//   node scripts/jira-live-check.mjs          read the state of a few issues (reads only)
//   node scripts/jira-live-check.mjs write    also create one issue in the KAN project, comment on it and close it
//
// Both commands are listed in this repository's `use-commands` answer, so changing this file changes what the approval
// covers: review any change to it as you would a change to a permission. It works in a scratch project under the system
// temporary directory, so no file of this repository is touched. The `write` run creates one real issue titled
// "go-getter write check (safe to delete)" and closes it; go-getter has no verb that deletes an issue.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackerSource } from '../compiler/src/trackers/index.mjs';
import { callSource } from '../compiler/src/trackers/worksource.mjs';
import { planIssue } from '../compiler/src/trackers/write.mjs';

// The owner's site. Only a loopback address may replace it (the tests do), so no environment can point the credentials elsewhere.
const loopback = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.GG_JIRA_LIVE_SITE ?? '');
const SITE = loopback ? process.env.GG_JIRA_LIVE_SITE : 'https://go-getter.atlassian.net';
const READ_KEYS = ['KAN-1', 'KAN-2', 'SAM1-1', 'KAN-99999']; // the last does not exist: it proves "not found" is told from a failure
const write = process.argv[2] === 'write';
if (process.argv.length > 3 || (process.argv[2] && !write)) {
  console.error('usage: node scripts/jira-live-check.mjs [write]');
  process.exit(2);
}

function scratch(plan, writes) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-jira-live-'));
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), plan);
  const settings = { site: SITE, auth: 'basic', 'email-env': 'JIRA_EMAIL', 'token-env': 'CLOUD_JIRA_KEY', project: 'KAN', 'issue-type': 'Task' };
  const yaml = Object.entries(settings).map(([k, v]) => `  tracker-jira-${k}: ${JSON.stringify(v)}`).join('\n');
  writeFileSync(path.join(dir, 'docs/decisions/0001-jira.md'), `---\nid: 0001-jira\ntitle: Jira settings for a live check\nstatus: active\ndate: 2026-10-11\ntags: [x]\ngo-getter:\n  tracker: jira\n  tracker-writes: ${writes}\n${yaml}\n---\n\nx\n`);
  return { dir, file: path.join(dir, 'docs/plans/p.md') };
}

const list = async (s) => {
  const r = await callSource(s, 'list');
  if (!r.ok) throw new Error(`list failed: ${r.error.message}`);
  return r.result.steps;
};
const show = (s) => {
  const i = s.issueState ?? {};
  return `${s.issue}: issue=${i.state} stale=${i.stale} error=${i.error ?? '-'} title=${i.title ? JSON.stringify(i.title) : '-'} step=${s.state}${s.mismatch ? ` (${s.mismatch})` : ''}`;
};

let failed = false;
const fail = (message) => {
  failed = true;
  console.log(`FAILED: ${message}`);
};

// 1. Reads.
const reads = scratch(`# Live read check\n\n${READ_KEYS.map((k, n) => `### ${n + 1} ${k} — [ ]\nIssue: ${k}\nDone-when: x.\n`).join('\n')}`, 'off');
try {
  const steps = await list(trackerSource(reads.file, { project: reads.dir, name: 'docs/plans/p.md' }));
  for (const s of steps) console.log(show(s));
  const control = steps.at(-1).issueState;
  if (control?.state !== 'unknown' || control.stale) fail('the issue that does not exist was not reported as not found');
  const read = steps.slice(0, -1).filter((s) => ['open', 'in progress', 'done'].includes(s.issueState?.state));
  console.log(`read check: ${read.length} of ${steps.length - 1} real issues read`);
  if (!read.length) fail('no issue could be read');
} catch (err) {
  fail(err.message);
} finally {
  rmSync(reads.dir, { recursive: true, force: true });
}

// 2. Writes (only when asked): create, comment, close, then read the issue back.
if (write && !failed) {
  const w = scratch('# Live write check\n\n### 1 go-getter write check (safe to delete) — [ ]\nDo: confirm that go-getter can create, comment on and close a Jira issue. This issue was made by a scratch check and can be deleted.\nDone-when: the issue was created, commented on and closed.\n', 'allow');
  try {
    for (const [verb, opts] of [['create', {}], ['comment', { text: 'go-getter write check: this comment was posted by the comment verb.' }], ['close', {}]]) {
      const r = await planIssue(w.dir, w.file, 'docs/plans/p.md', verb, '1', opts);
      console.log(`${verb}: ${r.ok ? r.message : `FAILED: ${r.error}`}`);
      if (!r.ok) {
        failed = true;
        break;
      }
    }
    if (!failed) {
      const [step] = await list(trackerSource(w.file, { project: w.dir, name: 'docs/plans/p.md' }));
      console.log(show(step));
      if (step.issueState?.state !== 'done') fail('the issue is not done after close');
    }
  } catch (err) {
    fail(err.message);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
}

console.log(failed ? 'jira live check: FAILED' : `jira live check: ok${write ? ' (read and write)' : ' (read)'}`);
process.exit(failed ? 1 : 0);
