import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readLog, record, recordApproval, summarize } from '../src/telemetry/record.mjs';
import { PENDING_TIMEOUT_MS, addPendingApproval, settlePending } from '../src/telemetry/approval-pending.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';
import { APPROVAL_CLASS, approvalClass } from '../src/telemetry/approval-class.mjs';
import { CATALOG as GATED } from '../src/gate.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

const guardrail = (id, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;

const RECORDING = `---\nid: 0051-rec\ntitle: rec\nstatus: active\ndate: 2026-11-05\ntags: [observability]\ntrack: process\ngo-getter:\n  telemetry-recording: "metadata-log"\n---\n\n## Decision\n\nx\n\n## Why\n\nx\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-approval-class-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/decisions/0051-rec.md'), RECORDING);
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/guardrails/gated-actions.md'), guardrail('gated-actions', 'builtin:gate-command classes=irreversible,outward'));
  return dir;
}

const hook = (dir, phase, payload) => spawnSync(process.execPath, [cli, 'hook', phase, '--host', 'claude-code', '--project', dir], { input: JSON.stringify(payload), encoding: 'utf8' });
const bash = (command, session = 's1') => ({ session_id: session, tool_name: 'Bash', tool_input: { command } });

test('an asked irreversible stop and an asked routine stop are read back with their class and outcome', () => {
  const dir = project();
  try {
    // irreversible: a branch delete that would lose unmerged work asks, then runs after a yes.
    spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: dir });
    spawnSync('git', ['branch', 'old'], { cwd: dir });
    const del = bash('git branch -D old');
    const asked = hook(dir, 'pre-tool', del);
    assert.match(asked.stdout, /ask/, asked.stdout + asked.stderr);
    hook(dir, 'post-tool', { ...del, tool_response: 'Deleted branch old' });
    // routine: a pull request creation that the person rejects (the agent moves on to another call).
    recordApproval(dir, { action: 'pr-create', outcome: 'rejected', host: 'claude-code' });
    const approvals = readLog(dir).filter((r) => r.event === 'approval');
    const irreversible = approvals.find((r) => r.action === 'git-branch-delete');
    const routine = approvals.find((r) => r.action === 'pr-create');
    assert.deepEqual([irreversible?.class, irreversible?.outcome], ['irreversible', 'approved']);
    assert.deepEqual([routine?.class, routine?.outcome], ['routine', 'rejected']);
    const sum = summarize(readLog(dir)).approvals;
    const day = new Date().toISOString().slice(0, 10);
    assert.deepEqual(sum.byClass, { irreversible: { approved: 1 }, routine: { rejected: 1 } });
    assert.deepEqual(sum.byDay[day], { irreversible: 1, routine: 1 });
    assert.equal(JSON.stringify(readLog(dir)).includes('old'), false, 'no command text or branch name in the log');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an ask followed by another call of the session is a rejection', () => {
  const dir = project();
  try {
    spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: dir });
    spawnSync('git', ['branch', 'old'], { cwd: dir });
    hook(dir, 'pre-tool', bash('git branch -D old'));
    hook(dir, 'pre-tool', bash('ls')); // the session moved on without running it
    const rejected = readLog(dir).filter((r) => r.event === 'approval');
    assert.deepEqual(rejected.map((r) => [r.action, r.class, r.outcome]), [['git-branch-delete', 'irreversible', 'rejected']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an ask nobody answered within the timeout is a time-out', () => {
  const dir = project();
  try {
    const t0 = new Date('2026-11-05T10:00:00.000Z');
    addPendingApproval(dir, { session: 's1', command: 'git branch -D old', action: 'git-branch-delete' }, t0);
    settlePending(dir, { session: 's2', command: 'ls' }, new Date(t0.getTime() + PENDING_TIMEOUT_MS + 1000));
    assert.deepEqual(readLog(dir).filter((r) => r.event === 'approval').map((r) => [r.action, r.class, r.outcome]), [['git-branch-delete', 'irreversible', 'timed-out']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the class comes from the table: every gated shape is listed, an unknown shape is irreversible', () => {
  for (const g of GATED) {
    assert.ok(g.id in APPROVAL_CLASS, `${g.id} is missing from the class table`);
    if (g.class === 'irreversible') assert.equal(APPROVAL_CLASS[g.id], 'irreversible', g.id);
  }
  assert.equal(approvalClass('not-a-shape'), 'irreversible');
  const dir = project();
  try {
    recordApproval(dir, { action: 'git push origin main', outcome: 'approved' });
    const [r] = readLog(dir);
    assert.deepEqual([r.action, r.class], ['unclassified-stop', 'irreversible']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the validator refuses content-like values and a class the table does not give', () => {
  const base = { ts: '2026-11-05T00:00:00.000Z', event: 'approval', action: 'pr-create', class: 'routine', outcome: 'approved' };
  assert.deepEqual(validateRecord(base), []);
  for (const patch of [{ action: 'gh pr merge 5' }, { action: '/etc/passwd' }, { class: 'irreversible' }, { class: 'maybe' }, { outcome: 'allowed' }, { outcome: 'yes, go ahead' }]) {
    assert.ok(validateRecord({ ...base, ...patch }).length > 0, JSON.stringify(patch));
  }
  assert.ok(validateRecord({ ...base, class: undefined }).length > 0 || validateRecord({ ts: base.ts, event: 'approval', action: 'pr-create', outcome: 'approved' }).length > 0);
  assert.ok(validateRecord({ ts: base.ts, event: 'pre-tool', class: 'routine' }).length > 0, 'class belongs to approval events');
  assert.ok(validateRecord({ ts: base.ts, event: 'pre-tool', outcome: 'approved' }).length > 0);
  const dir = project();
  try {
    assert.throws(() => record(dir, { event: 'approval', action: 'git push origin main', class: 'routine', outcome: 'approved' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('telemetry summary prints approvals per class and per day', () => {
  const dir = project();
  try {
    recordApproval(dir, { action: 'release', outcome: 'approved' });
    recordApproval(dir, { action: 'pr-create', outcome: 'timed-out' });
    const res = spawnSync(process.execPath, [cli, 'telemetry', 'summary', '--project', dir], { encoding: 'utf8' });
    const out = JSON.parse(res.stdout);
    assert.equal(out.approvals.total, 2);
    assert.deepEqual(out.approvals.byClass, { irreversible: { approved: 1 }, routine: { 'timed-out': 1 } });
    assert.equal(Object.keys(out.approvals.byDay).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pull request merge is irreversible: it can only be compensated by a revert', () => {
  assert.equal(approvalClass('pr-merge'), 'irreversible');
});

test('the typed `approvals release` records an irreversible approval event', () => {
  const dir = project();
  try {
    spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: dir });
    const origin = mkdtempSync(path.join(tmpdir(), 'gg-approval-origin-'));
    spawnSync('git', ['init', '-q', '--bare', '-b', 'main'], { cwd: origin });
    spawnSync('git', ['remote', 'add', 'origin', origin], { cwd: dir });
    spawnSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir });
    spawnSync('git', ['remote', 'set-head', 'origin', 'main'], { cwd: dir });
    const res = spawnSync(process.execPath, [cli, 'approvals', 'release', 'v1.2.3'], { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const ev = readLog(dir).filter((r) => r.event === 'approval');
    assert.deepEqual(ev.map((r) => [r.action, r.class, r.outcome]), [['release', 'irreversible', 'approved']]);
    assert.equal(JSON.stringify(ev).includes('1.2.3'), false, 'the version is not written to the log');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
