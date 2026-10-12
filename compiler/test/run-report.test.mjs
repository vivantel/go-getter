// The end-of-run report (decision 0130 item 9, step 5 of the autonomous-run plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { startRun, noteEvent, noteStop, endRun } from '../src/runs/record.mjs';
import { buildReport } from '../src/runs/report.mjs';
import { addShape } from '../src/secrets/approvals.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';
import { installGh } from './support/gh-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', env: cleanGitEnv(process.env) });
const FAKE_TOKEN = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
const step = (i, marker, extra = '') => `### ${i} Step ${i} — [${marker}]\nIssue: #${100 + i}\nClass: implement · Effort: low · Needs: none · Check: \`true\`${extra}\nDo: SECRETBODY ${i}.\nDone-when: done ${i}.\n`;
const PLAN = (markers, extra = {}) => `# P — plan\n\n**Status legend**: x\n\n${markers.map((m, i) => step(i + 1, m, extra[i + 1] ?? '')).join('\n')}`;
const decision = (name, body) => `---\nid: ${name}\ntitle: ${name}\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n${body}---\n\nx\n`;

function setup({ markers = [' ', ' ', ' '], extra, writes = 'allow' } = {}) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-report-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN(markers, extra));
  writeFileSync(path.join(dir, 'docs/decisions/0001-t.md'), decision('0001-t', '  telemetry-recording: metadata-log\n'));
  if (writes) writeFileSync(path.join(dir, 'docs/decisions/0002-w.md'), decision('0002-w', `  tracker-writes: ${writes}\n`));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  const gh = installGh(base, { repo: 'acme/app', issues: [] });
  symlinkSync(cli, path.join(base, 'go-getter'));
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${base}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    dir, gh,
    start: (opts = {}) => startRun(dir, { plan: 'docs/plans/p.md', steps: ['1', '2', '3'], grants: ['pr-merge'], ...opts }),
    setPlan: (m, e) => writeFileSync(path.join(dir, 'docs/plans/p.md'), PLAN(m, e)),
    commit: (subject) => git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', subject),
    cli: (...args) => spawnSync('node', [cli, ...args], { cwd: dir, encoding: 'utf8', env: process.env }),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('a finished run reports its steps, merged pull requests, spend and approvals with links', () => {
  const s = setup();
  try {
    s.start();
    s.commit('feat: one (#158)');
    s.commit('docs: not a pull request');
    s.setPlan(['x', 'x', 'x']);
    addShape(s.dir, 'pr-create', { host: 'claude' });
    const { text } = buildReport(s.dir, endRun(s.dir, { reason: 'ended' }));
    assert.match(text, /Steps done \(3\/3\)/);
    assert.match(text, /- 1 Step 1 \(\[#101\]\(https:\/\/github.com\/acme\/app\/issues\/101\)\)/);
    assert.match(text, /\[#158\]\(https:\/\/github.com\/acme\/app\/pull\/158\)/);
    assert.match(text, /\*\*Not done\*\*\n- none/);
    assert.match(text, /Spend:\*\* \$0.00 \(no cap\)/);
    assert.match(text, /run grants: pr-merge; remembered shapes: pr-create/);
  } finally { s.cleanup(); }
});

test('a stopped run reports the stop, denials, attempts and the steps skipped with reasons', () => {
  const s = setup({ markers: ['x', ' ', ' '], extra: { 2: ' · Human: owner decision' } });
  try {
    s.start({ steps: ['2', '3'] });
    noteEvent(s.dir, 'attempt', '3');
    noteEvent(s.dir, 'denial', '2', 'gated');
    noteStop(s.dir, { code: 'human-needed', step: '2', reason: 'step 2 needs a person: owner decision' });
    const { text } = buildReport(s.dir, endRun(s.dir, { reason: 'ended' }));
    assert.match(text, /Steps done \(0\/2\)/);
    assert.match(text, /- 2 Step 2: human-needed: step 2 needs a person: owner decision/);
    assert.match(text, /- 3 Step 3: not reached \(run ended\)/);
    assert.match(text, /\*\*Stops:\*\* human-needed at step 2/);
    assert.match(text, /\*\*Denials:\*\* step 2: gated ×1/);
    assert.match(text, /\*\*Fix attempts:\*\* step 3 ×1/);
  } finally { s.cleanup(); }
});

test('the report holds no step body, command or prompt text', () => {
  const s = setup();
  try {
    s.start();
    noteEvent(s.dir, 'denial', '1', 'gated');
    const { text } = buildReport(s.dir, endRun(s.dir, { reason: 'ended' }));
    assert.doesNotMatch(text, /SECRETBODY|done 1|true/);
  } finally { s.cleanup(); }
});

test('run end posts the report as a comment on the last step issue of the range', () => {
  const s = setup();
  try {
    s.start();
    const r = s.cli('run', 'end');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /report posted: commented on acme\/app#103/);
    const sent = s.gh.inputs().find((i) => i.args.includes('comment'));
    assert.deepEqual(sent.args.slice(0, 3), ['issue', 'comment', '103']);
    assert.match(sent.stdin, /Autonomous run report: docs\/plans\/p.md/);
  } finally { s.cleanup(); }
});

test('a secret or an email in the report blocks the post and the report is printed instead', () => {
  const s = setup({ extra: { 3: '' } });
  try {
    s.start();
    // a plan step title is the only free text in a report: put a token in one
    writeFileSync(path.join(s.dir, 'docs/plans/p.md'), PLAN([' ', ' ', ' ']).replace('Step 3 —', `Step 3 ${FAKE_TOKEN} —`));
    const r = s.cli('run', 'end');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /report not posted \(refused: the text to send contains github/);
    assert.equal(s.gh.inputs().filter((i) => i.args.includes('comment')).length, 0);
    assert.match(r.stdout, /Autonomous run report/);
  } finally { s.cleanup(); }
});

test('without tracker writes or an issue the report is printed', () => {
  const off = setup({ writes: null });
  try {
    off.start();
    const r = off.cli('run', 'end');
    assert.match(r.stdout, /report not posted \(plan issue writes are off/);
    assert.match(r.stdout, /Autonomous run report/);
  } finally { off.cleanup(); }
  const none = setup();
  try {
    writeFileSync(path.join(none.dir, 'docs/plans/p.md'), PLAN([' ', ' ', ' ']).replaceAll(/Issue: #\d+\n/g, ''));
    none.start();
    const r = none.cli('run', 'end');
    assert.match(r.stdout, /the plan has no issue to post it on/);
  } finally { none.cleanup(); }
});
