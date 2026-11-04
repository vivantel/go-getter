// Work-coordination K6 (decisions 0167 item 3, 0175 item 3): the merge queue, driven against a real repository with a bare origin and a fake `gh`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanGitEnv } from '../src/git-env.mjs';
import { defaultRunner, ship, ShipError } from '../src/ship.mjs';
import { enqueue, pickBatch, queueResult, readQueue, runQueue, formatStatus } from '../src/work/queue.mjs';

const GIT_ENV = { ...cleanGitEnv(process.env), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.invalid' };
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CI = { intervalMs: 0, noCiGraceMs: 0, timeoutMs: 5000 };
const runner = { kind: 'ci', id: 'w-runner' };
const other = { kind: 'ci', id: 'w-other' };
const dev = { kind: 'agent', id: 'w-dev' };

const decision = (id, extra = '') => `---\nid: ${id}\ntitle: ${id}\nstatus: active\ndate: 2026-11-04\ntags: [roadmap]\n---\n\n## Body\n${extra}\n`;

// A work clone on main with a bare origin, and a fake `gh` whose merges move origin's main.
function scratch() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-mq-')));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  mkdirSync(path.join(work, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(work, 'README.md'), 'hello\n');
  writeFileSync(path.join(work, 'docs/decisions/0001-first.md'), decision('0001-first'));
  sh(work, 'add', '-A');
  sh(work, 'commit', '-qm', 'chore: init');
  sh(work, 'branch', '-M', 'main');
  sh(work, 'push', '-q', '-u', 'origin', 'main');
  sh(work, 'remote', 'set-head', 'origin', '-a');

  const gh = { prs: new Map(), next: 100, calls: [], reruns: new Set(), native: false, merges: [] };
  const onRemote = (ref, file) => {
    try {
      return execFileSync('git', ['--git-dir', remote, 'show', `${ref}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
  const bucket = (head) => {
    if (onRemote(`refs/heads/${head}`, 'ci-red.txt') !== null) return 'fail';
    if (onRemote(`refs/heads/${head}`, 'ci-flaky.txt') !== null && !gh.reruns.has(head)) return 'fail';
    return 'pass';
  };
  const find = (ref) => [...gh.prs.values()].find((p) => String(p.number) === String(ref) || p.head === ref);
  const out = (v) => ({ code: 0, out: typeof v === 'string' ? v : JSON.stringify(v), err: '' });
  const run = (cmd, args, opts = {}) => {
    if (cmd !== 'gh') return defaultRunner(cmd, args, opts);
    gh.calls.push(args.join(' '));
    const flag = (n) => args[args.indexOf(n) + 1];
    const [a, b] = args;
    if (a === '--version') return out('gh version fake');
    if (a === 'api') return out(gh.native ? [{ type: 'merge_queue' }] : []);
    if (a === 'pr' && b === 'create') {
      const pr = { number: gh.next++, head: flag('--head'), title: flag('--title'), state: 'OPEN', url: `https://example.test/pull/${gh.next - 1}` };
      gh.prs.set(pr.number, pr);
      return out(pr.url);
    }
    if (a === 'pr' && b === 'view') {
      const pr = find(args[2]);
      return pr ? out({ number: pr.number, url: pr.url, state: pr.state, title: pr.title }) : { code: 1, out: '', err: 'no pull requests found' };
    }
    if (a === 'pr' && b === 'checks') {
      const pr = find(args[2]);
      return { ...out([{ name: 'ci', bucket: bucket(pr.head) }]), code: bucket(pr.head) === 'pass' ? 0 : 1 };
    }
    if (a === 'pr' && b === 'merge') {
      const pr = find(args[2]);
      execFileSync('git', ['--git-dir', remote, 'update-ref', 'refs/heads/main', `refs/heads/${pr.head}`], { env: GIT_ENV });
      pr.state = 'MERGED';
      gh.merges.push(pr.number);
      return out('merged');
    }
    if (a === 'pr' && b === 'close') {
      find(args[2]).state = 'CLOSED';
      return out('closed');
    }
    if (a === 'run' && b === 'list') return out([{ databaseId: 1, conclusion: 'failure' }]);
    if (a === 'run' && b === 'rerun') {
      gh.reruns.add(flag('--branch') ?? [...gh.prs.values()].filter((p) => p.state === 'OPEN').map((p) => p.head).pop());
      return out('ok');
    }
    return { code: 1, out: '', err: `fake gh: unsupported ${args.join(' ')}` };
  };
  // gh run rerun carries no branch in the real CLI; remember the branch of the last `run list`.
  const wrapped = (cmd, args, opts) => {
    if (cmd === 'gh' && args[0] === 'run' && args[1] === 'list') gh.listed = args[args.indexOf('--branch') + 1];
    if (cmd === 'gh' && args[0] === 'run' && args[1] === 'rerun') {
      gh.calls.push(args.join(' '));
      gh.reruns.add(gh.listed);
      return out('ok');
    }
    return run(cmd, args, opts);
  };
  // A pull request for a branch holding `files`, queued. Returns the entry.
  const open = async (name, files, { scope, check = null, unit = null, who = dev } = {}) => {
    sh(work, 'switch', '-q', '-c', name, 'main');
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(work, f)), { recursive: true });
      writeFileSync(path.join(work, f), text);
    }
    sh(work, 'add', '-A');
    sh(work, 'commit', '-qm', `feat: ${name}`);
    sh(work, 'push', '-q', 'origin', name);
    const sha = sh(work, 'rev-parse', 'HEAD');
    sh(work, 'switch', '-q', 'main');
    const pr = { number: gh.next++, head: name, title: `feat: ${name}`, state: 'OPEN', url: `https://example.test/pull/${gh.next - 1}` };
    gh.prs.set(pr.number, pr);
    const r = await enqueue(work, who, { pr: pr.number, branch: name, sha, title: pr.title, unit, scope: scope ?? [], check });
    assert.equal(r.ok, true, r.error);
    return { pr: pr.number, entry: r.entry };
  };
  const mainFile = (f) => onRemote('refs/heads/main', f);
  const mainFiles = () => execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'refs/heads/main'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return { dir, remote, work, gh, run: wrapped, open, mainFile, mainFiles, batchPrs: () => [...gh.prs.values()].filter((p) => p.head.startsWith('queue/batch-')) };
}

test('pickBatch takes the first run of changes with disjoint scopes and keeps an unscoped change alone', () => {
  const e = (pr, scope) => ({ item: { pr }, scope });
  assert.deepEqual(pickBatch([e(1, ['src/a/**']), e(2, ['src/b/**']), e(3, ['src/a/x.mjs']), e(4, ['docs/**'])]).map((x) => x.item.pr), [1, 2, 4]);
  assert.deepEqual(pickBatch([e(1, []), e(2, ['src/b/**'])]).map((x) => x.item.pr), [1]);
  assert.deepEqual(pickBatch([e(1, ['src/a/**']), e(2, [])]).map((x) => x.item.pr), [1]);
  assert.deepEqual(pickBatch([]), []);
});

test('a batch of disjoint changes merges together in one pull request; an overlapping one waits for the next', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'], check: 'true' });
  const b = await s.open('feat/b', { 'src/b/one.txt': 'b\n' }, { scope: ['src/b/**'], check: 'true' });
  const c = await s.open('feat/c', { 'src/a/two.txt': 'c\n' }, { scope: ['src/a/two.txt'], check: 'true' });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.merged.sort(), [a.pr, b.pr, c.pr].sort());
  assert.deepEqual(r.returned, []);
  assert.equal(s.batchPrs().length, 2, 'a and b together, c in the next batch');
  for (const f of ['src/a/one.txt', 'src/b/one.txt', 'src/a/two.txt']) assert.notEqual(s.mainFile(f), null, f);
  assert.equal(queueResult(s.work, a.pr, a.entry.created).outcome, 'merged');
  assert.equal(readQueue(s.work).pending.length, 0);
  assert.match(formatStatus(readQueue(s.work)), /runner: none\nqueued: none/);
});

test('a red batch is bisected: the culprit returns to its claimant with the failing check and the rest merge', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'], check: 'true' });
  const b = await s.open('feat/b', { 'src/b/bad.txt': 'b\n' }, { scope: ['src/b/**'], check: 'test ! -e src/b/bad.txt', unit: 'plan#B' });
  const c = await s.open('feat/c', { 'src/c/one.txt': 'c\n' }, { scope: ['src/c/**'], check: 'true' });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged.sort(), [a.pr, c.pr].sort());
  assert.equal(r.returned.length, 1);
  assert.equal(r.returned[0].pr, b.pr);
  assert.match(r.returned[0].reason, /failed `test ! -e src\/b\/bad.txt`/);
  const res = queueResult(s.work, b.pr, b.entry.created);
  assert.equal(res.outcome, 'returned');
  assert.equal(res.unit, 'plan#B');
  assert.match(res.check, /test ! -e src\/b\/bad.txt/);
  assert.equal(s.mainFile('src/b/bad.txt'), null);
  assert.notEqual(s.mainFile('src/a/one.txt'), null);
  assert.notEqual(s.mainFile('src/c/one.txt'), null);
});

test('a red CI batch is bisected the same way', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'] });
  const b = await s.open('feat/b', { 'src/b/ci-red.txt': 'x\n', 'ci-red.txt': 'x\n' }, { scope: ['src/b/**', 'ci-red.txt'] });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged, [a.pr]);
  assert.equal(r.returned[0].pr, b.pr);
  assert.match(r.returned[0].reason, /CI failed on ci/);
});

test('two runners never act at once: the second finds the queue busy, and a concurrent pair merges each change once', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'], check: 'true' });
  const b = await s.open('feat/b', { 'src/b/one.txt': 'b\n' }, { scope: ['src/b/**'], check: 'true' });
  // While runner one holds the lease (it is inside a batch), runner two is refused. The hook fires from the fake gh.
  let during = null;
  const spy = (cmd, args, opts) => {
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create' && !during) during = runQueue(s.work, other, { run: s.run, ci: CI });
    return s.run(cmd, args, opts);
  };
  const first = await runQueue(s.work, runner, { run: spy, ci: CI });
  const second = await during;
  assert.deepEqual(first.merged.sort(), [a.pr, b.pr].sort());
  assert.equal(second.busy, true, 'the second runner saw the lease held');
  assert.match(second.message, /being run by ci w-runner/);
  assert.deepEqual(second.merged, []);
  // Two runners started together: each change merges exactly once.
  const c = await s.open('feat/c', { 'src/c/one.txt': 'c\n' }, { scope: ['src/c/**'], check: 'true' });
  const d = await s.open('feat/d', { 'src/d/one.txt': 'd\n' }, { scope: ['src/d/**'], check: 'true' });
  const both = await Promise.all([runQueue(s.work, runner, { run: s.run, ci: CI }), runQueue(s.work, other, { run: s.run, ci: CI })]);
  const merged = both.flatMap((r) => r.merged).sort();
  assert.deepEqual(merged, [c.pr, d.pr].sort());
  assert.equal(s.gh.merges.filter((n) => n === c.pr || n === d.pr).length, 0, 'originals are merged only through batch pull requests');
});

test('a rebase conflict returns that unit and the rest merge', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'README.md': 'from a\n' }, { scope: ['src/a/**'], check: 'true', unit: 'plan#A' });
  const b = await s.open('feat/b', { 'README.md': 'from b\n' }, { scope: ['src/b/**'], check: 'true', unit: 'plan#B' });
  const c = await s.open('feat/c', { 'src/c/one.txt': 'c\n' }, { scope: ['src/c/**'], check: 'true' });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged.sort(), [a.pr, c.pr].sort());
  assert.equal(r.returned[0].pr, b.pr);
  assert.match(r.returned[0].reason, /rebase conflict on main/);
  assert.equal(queueResult(s.work, b.pr, b.entry.created).unit, 'plan#B');
  assert.equal(s.mainFile('README.md'), 'from a\n');
});

test('a check that fails once and passes on the rerun is a flake, not a red', async () => {
  const s = scratch();
  const flag = path.join(s.dir, 'flag');
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'], check: `test -e ${flag} || { touch ${flag}; exit 1; }` });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged, [a.pr]);
  assert.deepEqual(r.returned, []);
  assert.equal(queueResult(s.work, a.pr, a.entry.created).flaky.length, 1);
  assert.equal(s.batchPrs().length, 1, 'no bisect');
  // A check that fails twice is red.
  const b = await s.open('feat/b', { 'src/b/one.txt': 'b\n' }, { scope: ['src/b/**'], check: 'false' });
  const r2 = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.equal(r2.returned[0].pr, b.pr);
});

test('a CI check that fails once is rerun and passes', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'ci-flaky.txt': 'x\n' }, { scope: ['ci-flaky.txt'] });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged, [a.pr]);
  assert.ok(s.gh.calls.some((c) => c.startsWith('run rerun')), 'the failed run was rerun once');
});

test('final artifact ids are assigned at merge, in sequence, with references rewritten', async () => {
  const s = scratch();
  const a = await s.open('feat/a', { 'docs/decisions/draft-ua-first-thing.md': decision('draft-ua-first-thing'), 'docs/notes-a.md': 'see draft-ua-first-thing\n' }, { scope: ['docs/decisions/draft-ua-first-thing.md', 'docs/notes-a.md'] });
  const b = await s.open('feat/b', { 'docs/decisions/draft-ub-second-thing.md': decision('draft-ub-second-thing') }, { scope: ['docs/decisions/draft-ub-second-thing.md'] });
  const r = await runQueue(s.work, runner, { run: s.run, ci: CI });
  assert.deepEqual(r.merged.sort(), [a.pr, b.pr].sort());
  const files = s.mainFiles();
  assert.ok(files.includes('docs/decisions/0002-first-thing.md'), files.join(' '));
  assert.ok(files.includes('docs/decisions/0003-second-thing.md'), files.join(' '));
  assert.ok(!files.some((f) => f.includes('draft-')), 'no draft id is left');
  assert.equal(s.mainFile('docs/notes-a.md'), 'see 0002-first-thing\n');
  assert.match(s.mainFile('docs/decisions/INDEX.md'), /0002-first-thing/);
  assert.match(queueResult(s.work, a.pr, a.entry.created).ids[0], /draft-ua-first-thing -> 0002-first-thing/);
});

test('with the native merge queue the pull request is handed to GitHub and the outputs are the same', async () => {
  const s = scratch();
  s.gh.native = true;
  const origRun = s.run;
  const run = (cmd, args, opts) => {
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'merge' && args.includes('--auto')) return origRun('gh', ['pr', 'merge', args[2], '--squash'], opts);
    return origRun(cmd, args, opts);
  };
  const a = await s.open('feat/a', { 'src/a/one.txt': 'a\n' }, { scope: ['src/a/**'] });
  const r = await runQueue(s.work, runner, { run, ci: CI });
  assert.deepEqual(r.merged, [a.pr]);
  assert.equal(s.batchPrs().length, 0, 'no batch pull request: the native queue merges the pull request itself');
  assert.equal(queueResult(s.work, a.pr, a.entry.created).outcome, 'merged');
});

// ---- ship

// A feature branch with a change in the work clone, for `ship`.
function shipScratch() {
  const s = scratch();
  sh(s.work, 'switch', '-q', '-c', 'feat/add-thing', 'main');
  writeFileSync(path.join(s.work, 'thing.txt'), 'thing\n');
  return s;
}

test('ship with the queue on enqueues, waits for the queue and reports the merge; the reviewer pass runs once, in ship', async () => {
  const s = shipScratch();
  let reviews = 0;
  let conforms = 0;
  const logs = [];
  const result = await ship(s.work, {
    queue: true,
    who: dev,
    why: 'a thing is needed so users can do X',
    review: async () => (reviews++, { ok: true, summary: 'fine' }),
    conform: async () => (conforms++, { ok: true, summary: 'fine' }),
    intervalMs: 0,
    release: () => null,
    drive: () => runQueue(s.work, runner, { run: s.run, ci: CI }),
  }, s.run, (step, msg) => logs.push(`${step}: ${msg}`));
  assert.equal(result.merged, true);
  assert.equal(result.queued.outcome, 'merged');
  assert.equal(reviews, 1);
  assert.equal(conforms, 1);
  assert.notEqual(s.mainFile('thing.txt'), null);
  assert.ok(logs.some((l) => /^queue: #\d+ queued/.test(l)));
  assert.ok(!s.gh.calls.some((c) => c.startsWith(`pr checks ${result.pr.number} `)), 'ship did not wait for CI itself');
  assert.ok(!s.gh.calls.some((c) => c === `pr merge ${result.pr.number} --squash --delete-branch`), 'ship did not merge the pull request itself');
});

test('ship with the queue on fails with the failing check when the queue returns the change', async () => {
  const s = shipScratch();
  writeFileSync(path.join(s.work, 'ci-red.txt'), 'x\n');
  await assert.rejects(
    ship(s.work, { queue: true, who: dev, why: 'because', intervalMs: 0, release: () => null, drive: () => runQueue(s.work, runner, { run: s.run, ci: CI }) }, s.run),
    (err) => err instanceof ShipError && /the queue returned the change/.test(err.message) && /CI failed on ci/.test(err.message),
  );
  assert.equal(s.mainFile('thing.txt'), null);
});

test('ship with the queue off behaves as before: it waits for CI and merges the pull request itself', async () => {
  const s = shipScratch();
  const result = await ship(s.work, { queue: false, why: 'because', intervalMs: 0, noCiGraceMs: 0, release: () => null }, s.run);
  assert.equal(result.merged, true);
  assert.equal(result.queued, undefined);
  assert.ok(s.gh.calls.some((c) => c.startsWith('pr checks')), 'ship waited for CI');
  assert.equal(s.batchPrs().length, 0);
  assert.equal(existsSync(path.join(s.work, '.git/refs/go-getter/claims/queue')), false, 'no queue ledger was written');
});
